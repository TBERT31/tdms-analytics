"""
TDMS file processing utilities.
Handles conversion from TDMS files to ClickHouse storage.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List
from uuid import UUID

import numpy as np
import pandas as pd
from nptdms import TdmsFile
from concurrent.futures import ThreadPoolExecutor, as_completed
from ..app_settings import app_settings

from ..clients.clickhouse import ClickHouseClient
from ..entities.channel import ChannelCreate
from ..entities.dataset import DatasetCreate
from ..exceptions.tdms_exceptions import IngestionError, InvalidDataError
from ..repos.channel_repo import ChannelRepository
from ..repos.dataset_repo import DatasetRepository
from ..repos.sensor_data_repo import SensorDataRepository

logger = logging.getLogger(__name__)


def tdms_to_clickhouse(
    tdms_file_path: str,
    dataset_id: UUID,
    filename: str,
    clickhouse_client: ClickHouseClient
) -> List[Dict[str, Any]]:
    """
    Convert TDMS file to ClickHouse format and insert data.
    
    Args:
        tdms_file_path: Path to TDMS file
        dataset_id: UUID for the dataset
        filename: Original filename
        clickhouse_client: ClickHouse client instance
        
    Returns:
        List of channel metadata dictionaries
        
    Raises:
        IngestionError: If file processing fails
        InvalidDataError: If data validation fails
    """
    try:
        # Validate file exists
        file_path = Path(tdms_file_path)
        if not file_path.exists():
            raise IngestionError(f"TDMS file not found: {tdms_file_path}")
            
        logger.info(f"Processing TDMS file: {filename}")
        
        # Open TDMS file
        with TdmsFile.read(tdms_file_path) as tdms_file:
            channels_data = []
            total_points = 0
            
            # Process each group and channel
            for group in tdms_file.groups():
                group_name = group.name
                logger.debug(f"Processing group: {group_name}")
                
                for channel in group.channels():
                    channel_data = _process_tdms_channel(
                        channel, group_name, dataset_id, clickhouse_client
                    )
                    
                    if channel_data:
                        channels_data.append(channel_data)
                        total_points += channel_data["n_rows"]
                        
            if not channels_data:
                raise InvalidDataError("No valid channels found in TDMS file")
                
            # Create repositories
            dataset_repo = DatasetRepository(clickhouse_client)
            channel_repo = ChannelRepository(clickhouse_client)
            sensor_repo = SensorDataRepository(clickhouse_client)
            
            # Create dataset record
            dataset_create = DatasetCreate(
                filename=filename,
                total_points=total_points
            )
            dataset = dataset_repo.create(dataset_id, dataset_create)
            logger.info(f"Created dataset {dataset_id} with {total_points} total points")
            
            # Insert channels and sensor data
            channels_meta = []
            to_build = []

            for channel_data in channels_data:
                channel_create = ChannelCreate(
                    dataset_id=dataset_id,
                    group_name=channel_data["group_name"],
                    channel_name=channel_data["channel_name"],
                    unit=channel_data.get("unit", ""),
                    has_time=channel_data["has_time"],
                    n_rows=channel_data["n_rows"]
                )
                channel = channel_repo.create(channel_data["channel_id"], channel_create)

                if channel_data["n_rows"] > 0:
                    _insert_sensor_data(
                        channel_data, dataset_id, sensor_repo
                    )

                channels_meta.append({
                    "channel_id": str(channel.id),
                    "group_name": channel.group_name,
                    "channel_name": channel.channel_name,
                    "unit": channel.unit,
                    "has_time": channel.has_time,
                    "n_rows": channel.n_rows
                })
                
                logger.info(
                    f"Processed channel {channel.channel_name} "
                    f"({channel.n_rows} points, has_time={channel.has_time})"
                )
            
            return channels_meta
            
    except Exception as e:
        logger.error(f"Error processing TDMS file {filename}: {e}")
        if isinstance(e, (IngestionError, InvalidDataError)):
            raise
        raise IngestionError(f"Failed to process TDMS file: {str(e)}") from e


def _process_tdms_channel(
    channel,
    group_name: str,
    dataset_id: UUID,
    clickhouse_client: ClickHouseClient
) -> Dict[str, Any]:
    """
    Process a single TDMS channel and extract metadata and data.
    """
    try:
        channel_name = channel.name
        
        # Skip empty channels
        if len(channel) == 0:
            logger.warning(f"Skipping empty channel: {group_name}/{channel_name}")
            return None
            
        # Get channel data
        data = channel[:]
        if data is None or len(data) == 0:
            logger.warning(f"Skipping channel with no data: {group_name}/{channel_name}")
            return None
            
        # Convert to numpy array and handle different data types
        if hasattr(data, 'values'):  # pandas-like
            values = data.values
        else:
            values = np.asarray(data)
            
        # Handle complex data types by taking magnitude
        if np.iscomplexobj(values):
            values = np.abs(values)
            logger.info(f"Converted complex data to magnitude for {group_name}/{channel_name}")
            
        # Convert to float64
        try:
            values = values.astype(np.float64)
        except (ValueError, TypeError) as e:
            logger.warning(f"Could not convert data to float64 for {group_name}/{channel_name}: {e}")
            return None
            
        # Handle time information - Même logique que l'ancien code
        has_time = False
        timestamps_data = None
        
        # Essayer d'utiliser time_track() comme dans l'ancien code
        try:
            t = channel.time_track()
            if t is not None:
                timestamps_data = pd.to_datetime(t)  # vectorisé comme l'ancien code
                has_time = True
                logger.debug(f"Found time track for {group_name}/{channel_name}")
            else:
                timestamps_data = None
        except Exception as e:
            logger.info(f"Pas de timestamps pour {channel_name}: {e}")
            timestamps_data = None
        
        # Fallback sur les indices d'échantillons si pas de time info (comme l'ancien code)
        if not has_time:
            timestamps_data = pd.Series(np.arange(len(values), dtype=np.uint64))
            logger.debug(f"Using sample indices for {group_name}/{channel_name}")
            
        # Get unit information
        unit = ""
        if hasattr(channel, 'properties') and channel.properties:
            unit = str(channel.properties.get('NI_UnitDescription', ''))
            if not unit:
                unit = str(channel.properties.get('unit_string', ''))
                
        # Generate channel ID
        channel_id = clickhouse_client.new_channel_id()
        
        logger.info(f"Successfully processed channel {group_name}/{channel_name}: {len(values)} points, has_time={has_time}, unit='{unit}'")
        
        return {
            "channel_id": channel_id,
            "group_name": group_name,
            "channel_name": channel_name,
            "unit": unit,
            "has_time": has_time,
            "n_rows": len(values),
            "values": values,
            "timestamps": timestamps_data
        }
        
    except Exception as e:
        logger.error(f"Error processing channel {group_name}/{channel.name}: {e}")
        return None

def _build_data_dict_for_channel(
    channel_data: Dict[str, Any],
    dataset_id: UUID,
) -> Dict[str, Any]:
    """
    Construit un data_dict prêt pour Arrow pour 1 canal.
    Normalise les colonnes pour pouvoir concaténer entre canaux.
    Colonnes finales : dataset_id, channel_id, timestamp(us), sample_index, value, is_time_series
    """
    n_rows = channel_data["n_rows"]
    if n_rows == 0:
        return None

    channel_id = channel_data["channel_id"]
    has_time = channel_data["has_time"]
    values = channel_data["values"]
    timestamps = channel_data["timestamps"]

    if has_time:
        ts_pd = timestamps if isinstance(timestamps, pd.DatetimeIndex) else pd.to_datetime(timestamps, utc=False)
        ts_us = (ts_pd.view("int64") // 1000).astype("int64")
        sample_index = np.zeros(n_rows, dtype=np.uint64)
        is_ts = np.ones(n_rows, dtype=np.uint8)
        ts_col = ts_us  # int64 microseconds
    else:
        sample_index = np.asarray(timestamps, dtype=np.uint64)
        is_ts = np.zeros(n_rows, dtype=np.uint8)
        # on fixe un timestamp us = 0 pour normaliser la forme ; il sera ignoré (is_time_series=0)
        ts_col = np.zeros(n_rows, dtype=np.int64)

    return {
        "dataset_id": [str(dataset_id)] * n_rows,
        "channel_id": [str(channel_id)] * n_rows,
        "timestamp": ts_col,
        "sample_index": sample_index,
        "value": values.astype(np.float64, copy=False),
        "is_time_series": is_ts,
    }


def _concat_dicts(dicts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Concatène une liste de data_dict homogènes (mêmes clés).
    """
    if not dicts:
        return {}

    out: Dict[str, Any] = {}
    keys = ["dataset_id", "channel_id", "timestamp", "sample_index", "value", "is_time_series"]
    for k in keys:
        col = []
        for d in dicts:
            v = d[k]
            if isinstance(v, np.ndarray):
                col.append(v)
            else:
                # listes pour UUID/strings
                col.extend(v)
                continue
        if col and isinstance(col[0], np.ndarray):
            out[k] = np.concatenate(col, axis=0)
        else:
            out[k] = col
    return out

def _insert_sensor_data(
    channel_data: Dict[str, Any],
    dataset_id: UUID,
    sensor_repo: SensorDataRepository
) -> None:
    """
    Insert sensor data into ClickHouse using Arrow columnar path.
    """
    try:
        n_rows = channel_data["n_rows"]
        channel_id = channel_data["channel_id"]
        has_time = channel_data["has_time"]
        values = channel_data["values"]
        timestamps = channel_data["timestamps"]

        if n_rows == 0:
            return

        if has_time:
            # Garder un type temporel performant : int64 microsecondes
            if isinstance(timestamps, pd.DatetimeIndex):
                ts_pd = timestamps
            else:
                ts_pd = pd.to_datetime(timestamps, utc=False)

            # pandas datetime64[ns] -> int64 microsecondes
            ts_us = (ts_pd.view("int64") // 1000).astype("int64")

            data_dict = {
                # UUID envoyés comme strings côté Arrow (conversion rapide côté CH)
                "dataset_id": [str(dataset_id)] * n_rows,
                "channel_id": [str(channel_id)] * n_rows,
                "timestamp": ts_us,                         # int64 (us) -> Arrow timestamp(us)
                "sample_index": np.zeros(n_rows, dtype=np.uint64),
                "value": values.astype(np.float64, copy=False),
                "is_time_series": np.ones(n_rows, dtype=np.uint8),
            }
            columns = ["dataset_id", "channel_id", "timestamp", "sample_index", "value", "is_time_series"]
        else:
            data_dict = {
                "dataset_id": [str(dataset_id)] * n_rows,
                "channel_id": [str(channel_id)] * n_rows,
                "sample_index": np.asarray(timestamps, dtype=np.uint64),
                "value": values.astype(np.float64, copy=False),
                "is_time_series": np.zeros(n_rows, dtype=np.uint8),
            }
            columns = ["dataset_id", "channel_id", "sample_index", "value", "is_time_series"]

        # Insert using Arrow columnar fast path
        sensor_repo.bulk_insert_columnar(columns, data_dict)

    except Exception as e:
        logger.error(f"Error inserting sensor data for channel {channel_data['channel_name']}: {e}")
        raise IngestionError(f"Failed to insert sensor data: {str(e)}") from e
