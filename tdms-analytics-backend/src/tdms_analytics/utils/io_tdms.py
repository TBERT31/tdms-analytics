"""
Simplified TDMS processing utilities.
"""

import logging
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from nptdms import TdmsFile

from ..clients.clickhouse import ClickHouseClient
from ..exceptions.tdms_exceptions import IngestionError, InvalidDataError
from ..repos.sensor_readings_repo import SensorReadingsRepository

logger = logging.getLogger(__name__)


def tdms_to_clickhouse_simple(
    tdms_file_path: str,
    filename: str,
    clickhouse_client: ClickHouseClient
) -> Dict[str, Any]:
    """Ultra-simplified TDMS to ClickHouse conversion."""
    try:
        file_path = Path(tdms_file_path)
        if not file_path.exists():
            raise IngestionError(f"TDMS file not found: {tdms_file_path}")
            
        logger.info(f"Processing TDMS file: {filename}")
        
        # Repository
        sensor_repo = SensorReadingsRepository(clickhouse_client)
        
        total_points = 0
        channels_processed = 0
        
        start_time = time.time()
        
        # Process TDMS file
        with TdmsFile.read(tdms_file_path) as tdms_file:
            for group in tdms_file.groups():
                for channel in group.channels():
                    try:
                        values = channel[:]
                        if values is None or len(values) == 0:
                            continue
                            
                        # Get unit
                        unit = ""
                        if hasattr(channel, 'properties') and channel.properties:
                            unit = str(channel.properties.get('NI_UnitDescription', '') or 
                                      channel.properties.get('unit_string', ''))
                        
                        # Prepare data for this channel
                        channel_data = [
                            (filename, group.name, channel.name, unit, i, float(v))
                            for i, v in enumerate(values)
                        ]
                        
                        # Insert channel data
                        sensor_repo.bulk_insert_simple(channel_data)
                        
                        total_points += len(values)
                        channels_processed += 1
                        
                        logger.info(f"Processed {group.name}/{channel.name}: {len(values)} points")
                        
                    except Exception as e:
                        logger.error(f"Error processing channel {group.name}/{channel.name}: {e}")
                        continue
        
        if channels_processed == 0:
            raise InvalidDataError("No valid channels found in TDMS file")
            
        processing_time = time.time() - start_time
        if processing_time > 0:
            throughput = total_points / processing_time / 1000000
            logger.info(f"Ingestion completed in {processing_time:.2f}s ({throughput:.1f}M points/sec)")
        
        return {
            "filename": filename,
            "channels_processed": channels_processed,
            "total_points": total_points,
            "processing_time": processing_time
        }
        
    except Exception as e:
        logger.error(f"Error processing TDMS file {filename}: {e}")
        if isinstance(e, (IngestionError, InvalidDataError)):
            raise
        raise IngestionError(f"Failed to process TDMS file: {str(e)}") from e