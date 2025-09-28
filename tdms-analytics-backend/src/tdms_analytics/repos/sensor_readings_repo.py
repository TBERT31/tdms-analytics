import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

import numpy as np
import pandas as pd

from ..app_settings import app_settings
from ..clients.clickhouse import ClickHouseClient

logger = logging.getLogger(__name__)


class SensorReadingsRepository:
    """Simplified repository for flat sensor readings."""

    def __init__(self, clickhouse_client: ClickHouseClient):
        self.client = clickhouse_client

    def bulk_insert_simple(self, data: List[tuple], chunk_size: int = None) -> None:
        """Simple bulk insert for sensor readings."""
        if chunk_size is None:
            chunk_size = app_settings.chunk_size
            
        if not data:
            return

        columns = ["filename", "group_name", "channel_name", "unit", "sample_index", "value"]
        
        # Insert in chunks
        for start in range(0, len(data), chunk_size):
            end = min(start + chunk_size, len(data))
            chunk_data = data[start:end]
            
            self.client._insert("sensor_readings", chunk_data, column_names=columns)

    def get_datasets(self) -> List[Dict[str, Any]]:
        """Get list of unique datasets (filenames)."""
        result = self.client._execute("""
            SELECT 
                filename,
                min(ingestion_time) as created_at,
                count() as total_points,
                countDistinct(group_name, channel_name) as channels_count
            FROM sensor_readings
            GROUP BY filename
            ORDER BY created_at DESC
        """)
        
        return [
            {
                "filename": row[0],
                "created_at": row[1],
                "total_points": row[2],
                "channels_count": row[3],
            }
            for row in result.result_rows
        ]

    def get_channels(self, filename: str) -> List[Dict[str, Any]]:
        """Get channels for a specific dataset."""
        result = self.client._execute("""
            SELECT 
                group_name,
                channel_name,
                unit,
                count() as n_rows,
                min(sample_index) as min_index,
                max(sample_index) as max_index
            FROM sensor_readings
            WHERE filename = %(filename)s
            GROUP BY group_name, channel_name, unit
            ORDER BY group_name, channel_name
        """, {"filename": filename})
        
        return [
            {
                "group_name": row[0],
                "channel_name": row[1],
                "unit": row[2],
                "n_rows": row[3],
                "min_index": row[4],
                "max_index": row[5],
            }
            for row in result.result_rows
        ]

    def get_channel_data(
        self,
        filename: str,
        group_name: str,
        channel_name: str,
        start_index: Optional[int] = None,
        end_index: Optional[int] = None,
        limit: int = 50000,
    ) -> pd.DataFrame:
        """Get sensor data for a specific channel."""
        query = """
            SELECT sample_index as time, value
            FROM sensor_readings
            WHERE filename = %(filename)s 
              AND group_name = %(group_name)s 
              AND channel_name = %(channel_name)s
        """
        params = {
            "filename": filename,
            "group_name": group_name,
            "channel_name": channel_name
        }
        
        if start_index is not None:
            query += " AND sample_index >= %(start_idx)s"
            params["start_idx"] = start_index
        if end_index is not None:
            query += " AND sample_index <= %(end_idx)s"
            params["end_idx"] = end_index
            
        query += " ORDER BY sample_index LIMIT %(limit)s"
        params["limit"] = limit

        result = self.client._execute(query, params)
        return pd.DataFrame(result.result_rows, columns=["time", "value"])

    def get_time_range(self, filename: str, group_name: str, channel_name: str) -> Dict[str, Any]:
        """Get time range for a channel."""
        result = self.client._execute("""
            SELECT min(sample_index), max(sample_index), count()
            FROM sensor_readings
            WHERE filename = %(filename)s 
              AND group_name = %(group_name)s 
              AND channel_name = %(channel_name)s
        """, {
            "filename": filename,
            "group_name": group_name,
            "channel_name": channel_name
        })
        
        if result.result_rows and result.result_rows[0]:
            min_index, max_index, total_points = result.result_rows[0]
            return {
                "filename": filename,
                "group_name": group_name,
                "channel_name": channel_name,
                "has_time": False,
                "min_index": int(min_index) if min_index is not None else None,
                "max_index": int(max_index) if max_index is not None else None,
                "total_points": int(total_points),
            }

        return {
            "filename": filename,
            "group_name": group_name,
            "channel_name": channel_name,
            "has_time": False,
            "total_points": 0
        }