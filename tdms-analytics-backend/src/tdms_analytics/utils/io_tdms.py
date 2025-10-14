import logging
from pathlib import Path
from typing import Any, Dict, List
from uuid import UUID

import numpy as np
import pandas as pd
from nptdms import TdmsFile

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
    user_id: str,  # AJOUT: paramètre user_id
    filename: str,
    clickhouse_client: ClickHouseClient,
) -> List[Dict[str, Any]]:
    """
    Parse and ingest TDMS file into ClickHouse with user ownership.
    
    Args:
        tdms_file_path: Path to TDMS file
        dataset_id: UUID for this dataset
        user_id: Keycloak user ID (sub) who owns this dataset
        filename: Original filename
        clickhouse_client: ClickHouse client instance
    
    Returns:
        List of channel metadata dictionaries
        
    Raises:
        IngestionError: If file processing fails
        InvalidDataError: If no valid channels found
    """
    try:
        # Validate file exists
        file_path = Path(tdms_file_path)
        if not file_path.exists():
            raise IngestionError(f"TDMS file not found: {tdms_file_path}")
        
        logger.info(f"Processing TDMS file: {filename} for user {user_id}")
        
        # Open and process TDMS file
        with TdmsFile.read(tdms_file_path) as tdms_file:
            channels_data = _extract_all_channels(tdms_file, clickhouse_client)
            
            if not channels_data:
                raise InvalidDataError("No valid channels found in TDMS file")
            
            total_points = sum(ch["n_rows"] for ch in channels_data)
            logger.info(f"Extracted {len(channels_data)} channels with {total_points} total points")
            
            # Create dataset and insert all data
            channels_meta = _save_to_clickhouse(
                channels_data,
                dataset_id,
                user_id,  # AJOUT: passer user_id
                filename,
                total_points,
                clickhouse_client
            )
            
            return channels_meta
            
    except Exception as e:
        logger.error(f"Error processing TDMS file {filename}: {e}")
        if isinstance(e, (IngestionError, InvalidDataError)):
            raise
        raise IngestionError(f"Failed to process TDMS file: {str(e)}") from e


def _extract_all_channels(
    tdms_file,
    clickhouse_client: ClickHouseClient
) -> List[Dict[str, Any]]:
    """
    Extract all channels from TDMS file.
    
    Returns:
        List of channel data dictionaries
    """
    channels_data = []
    
    for group in tdms_file.groups():
        group_name = group.name
        logger.debug(f"Processing group: {group_name}")
        
        for channel in group.channels():
            channel_data = _process_channel(
                channel, 
                group_name,
                clickhouse_client
            )
            
            if channel_data:
                channels_data.append(channel_data)
    
    return channels_data


def _process_channel(
    channel,
    group_name: str,
    clickhouse_client: ClickHouseClient
) -> Dict[str, Any] | None:
    """
    Process a single TDMS channel and extract metadata and data.
    
    Returns:
        Channel data dictionary or None if channel is invalid
    """
    try:
        channel_name = channel.name
        
        # Skip empty channels
        if len(channel) == 0:
            logger.warning(f"Skipping empty channel: {group_name}/{channel_name}")
            return None
        
        # Extract and validate values
        values = _extract_values(channel, group_name, channel_name)
        if values is None:
            return None
        
        # Extract time information
        has_time, timestamps = _extract_timestamps(channel, len(values), channel_name)
        
        # Extract metadata
        unit = _extract_unit(channel)
        channel_id = clickhouse_client.new_channel_id()
        
        logger.info(
            f"Processed channel {group_name}/{channel_name}: "
            f"{len(values)} points, has_time={has_time}, unit='{unit}'"
        )
        
        return {
            "channel_id": channel_id,
            "group_name": group_name,
            "channel_name": channel_name,
            "unit": unit,
            "has_time": has_time,
            "n_rows": len(values),
            "values": values,
            "timestamps": timestamps
        }
        
    except Exception as e:
        logger.error(f"Error processing channel {group_name}/{channel.name}: {e}")
        return None


def _extract_values(channel, group_name: str, channel_name: str) -> np.ndarray | None:
    """
    Extract and convert channel values to float64.
    
    Returns:
        numpy array or None if conversion fails
    """
    try:
        # Get raw data
        data = channel[:]
        if data is None or len(data) == 0:
            logger.warning(f"Skipping channel with no data: {group_name}/{channel_name}")
            return None
        
        # Convert to numpy array
        if hasattr(data, 'values'):  # pandas-like
            values = data.values
        else:
            values = np.asarray(data)
        
        # Handle complex data types
        if np.iscomplexobj(values):
            values = np.abs(values)
            logger.info(f"Converted complex data to magnitude for {group_name}/{channel_name}")
        
        # Convert to float64
        return values.astype(np.float64)
        
    except (ValueError, TypeError) as e:
        logger.warning(f"Could not convert data to float64 for {group_name}/{channel_name}: {e}")
        return None


def _extract_timestamps(channel, n_rows: int, channel_name: str) -> tuple[bool, pd.Series | pd.DatetimeIndex]:
    """
    Extract time information from channel.
    
    Returns:
        Tuple of (has_time: bool, timestamps: Series or DatetimeIndex)
    """
    try:
        # Try to get time track
        time_track = channel.time_track()
        if time_track is not None:
            timestamps = pd.to_datetime(time_track)
            logger.debug(f"Found time track for {channel_name}")
            return True, timestamps
    except Exception as e:
        logger.debug(f"No time track for {channel_name}: {e}")
    
    # Fallback to sample indices
    timestamps = pd.Series(np.arange(n_rows, dtype=np.uint64))
    logger.debug(f"Using sample indices for {channel_name}")
    return False, timestamps


def _extract_unit(channel) -> str:
    """Extract unit information from channel properties."""
    if not hasattr(channel, 'properties') or not channel.properties:
        return ""
    
    unit = str(channel.properties.get('NI_UnitDescription', ''))
    if not unit:
        unit = str(channel.properties.get('unit_string', ''))
    
    return unit


def _save_to_clickhouse(
    channels_data: List[Dict[str, Any]],
    dataset_id: UUID,
    user_id: str,  # AJOUT: paramètre user_id
    filename: str,
    total_points: int,
    clickhouse_client: ClickHouseClient
) -> List[Dict[str, Any]]:
    """
    Save dataset, channels, and sensor data to ClickHouse.
    
    Returns:
        List of channel metadata dictionaries
    """
    # Initialize repositories
    dataset_repo = DatasetRepository(clickhouse_client)
    channel_repo = ChannelRepository(clickhouse_client)
    sensor_repo = SensorDataRepository(clickhouse_client)
    
    # Create dataset record
    dataset_create = DatasetCreate(
        user_id=user_id,  # AJOUT: user_id dans DatasetCreate
        filename=filename,
        total_points=total_points
    )
    dataset_repo.create(dataset_id, dataset_create)
    logger.info(f"Created dataset {dataset_id} for user {user_id} with {total_points} total points")
    
    # Insert channels and sensor data
    channels_meta = []
    
    for channel_data in channels_data:
        # Create channel record
        channel_create = ChannelCreate(
            dataset_id=dataset_id,
            group_name=channel_data["group_name"],
            channel_name=channel_data["channel_name"],
            unit=channel_data["unit"],
            has_time=channel_data["has_time"],
            n_rows=channel_data["n_rows"]
        )
        channel = channel_repo.create(channel_data["channel_id"], channel_create)
        
        # Insert sensor data if channel has data
        if channel_data["n_rows"] > 0:
            _insert_sensor_data(channel_data, dataset_id, sensor_repo)
        
        # Build metadata response
        channels_meta.append({
            "channel_id": str(channel.id),
            "group_name": channel.group_name,
            "channel_name": channel.channel_name,
            "unit": channel.unit,
            "has_time": channel.has_time,
            "n_rows": channel.n_rows
        })
        
        logger.info(
            f"Saved channel {channel.channel_name} "
            f"({channel.n_rows} points, has_time={channel.has_time})"
        )
    
    return channels_meta


def _insert_sensor_data(
    channel_data: Dict[str, Any],
    dataset_id: UUID,
    sensor_repo: SensorDataRepository
) -> None:
    """
    Insert sensor data into ClickHouse using Arrow columnar path.
    
    Args:
        channel_data: Channel data dictionary with values and timestamps
        dataset_id: Dataset UUID
        sensor_repo: Sensor data repository instance
        
    Raises:
        IngestionError: If data insertion fails
    """
    try:
        n_rows = channel_data["n_rows"]
        if n_rows == 0:
            return
        
        channel_id = channel_data["channel_id"]
        has_time = channel_data["has_time"]
        values = channel_data["values"]
        timestamps = channel_data["timestamps"]
        
        # Build data dictionary for Arrow insertion
        if has_time:
            # Convert timestamps to int64 microseconds
            if isinstance(timestamps, pd.DatetimeIndex):
                ts_pd = timestamps
            else:
                ts_pd = pd.to_datetime(timestamps, utc=False)
            
            ts_us = (ts_pd.view("int64") // 1000).astype("int64")
            
            data_dict = {
                "dataset_id": [str(dataset_id)] * n_rows,
                "channel_id": [str(channel_id)] * n_rows,
                "timestamp": ts_us,
                "sample_index": np.zeros(n_rows, dtype=np.uint64),
                "value": values.astype(np.float64, copy=False),
                "is_time_series": np.ones(n_rows, dtype=np.uint8),
            }
            columns = ["dataset_id", "channel_id", "timestamp", "sample_index", "value", "is_time_series"]
        else:
            # Use sample indices
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