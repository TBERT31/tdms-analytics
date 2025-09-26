import logging
from typing import Dict, List, Optional
from uuid import UUID

import numpy as np
import pandas as pd

from ..app_settings import app_settings
from ..clients.clickhouse import ClickHouseClient
from ..entities.sensor_data import SensorDataPoint, TimeRange
from ..exceptions.tdms_exceptions import ChannelNotFoundError

logger = logging.getLogger(__name__)


class SensorDataRepository:
    """Repository for sensor data operations."""

    def __init__(self, clickhouse_client: ClickHouseClient):
        self.client = clickhouse_client

    def bulk_insert_columnar(
        self, 
        columns: List[str], 
        data_dict: Dict[str, any], 
        chunk_size: int = None
    ) -> None:
        """Insert sensor data using columnar format for performance."""
        if chunk_size is None:
            chunk_size = app_settings.chunk_size
            
        # Validate all columns have same length
        lengths = {len(data_dict[col]) for col in columns}
        if len(lengths) != 1:
            raise ValueError("All columns must have the same length")
            
        total_rows = lengths.pop()
        if total_rows == 0:
            return

        # Convert pandas/numpy to lists for ClickHouse
        def to_list(data):
            if isinstance(data, (pd.Series, np.ndarray)):
                return data.tolist()
            return data

        # Insert in chunks
        for start in range(0, total_rows, chunk_size):
            end = min(start + chunk_size, total_rows)
            chunk_data = [to_list(data_dict[col][start:end]) for col in columns]
            
            self.client._insert(
                f"{self.client.database}.sensor_data",
                list(zip(*chunk_data)),  # Transpose for row-based insert
                column_names=columns
            )

    def get_channel_data(
        self,
        channel_id: UUID,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        limit: int = 50000,
    ) -> pd.DataFrame:
        """Get sensor data for a channel with optional time filtering."""
        # First check if channel exists and get has_time flag
        channel_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id}
        )
        
        if not channel_result.result_rows:
            raise ChannelNotFoundError(f"Channel {channel_id} not found")
            
        has_time = bool(channel_result.result_rows[0][0])

        if has_time:
            query = f"""
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
            """
            params = {"channel_id": channel_id}
            
            if start_timestamp is not None:
                query += " AND timestamp >= fromUnixTimestamp(%(start_ts)s)"
                params["start_ts"] = start_timestamp
            if end_timestamp is not None:
                query += " AND timestamp <= fromUnixTimestamp(%(end_ts)s)"
                params["end_ts"] = end_timestamp
                
            query += " ORDER BY timestamp LIMIT %(limit)s"
            params["limit"] = limit
        else:
            query = f"""
                SELECT sample_index as time, value
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
            """
            params = {"channel_id": channel_id}
            
            if start_timestamp is not None:
                query += " AND sample_index >= %(start_idx)s"
                params["start_idx"] = int(start_timestamp)
            if end_timestamp is not None:
                query += " AND sample_index <= %(end_idx)s"
                params["end_idx"] = int(end_timestamp)
                
            query += " ORDER BY sample_index LIMIT %(limit)s"
            params["limit"] = limit

        result = self.client._execute(query, params)
        return pd.DataFrame(result.result_rows, columns=["time", "value"])

    def get_time_range(self, channel_id: UUID) -> TimeRange:
        """Get time range information for a channel."""
        # Check if channel exists and get has_time flag
        meta_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id}
        )
        
        if not meta_result.result_rows:
            raise ChannelNotFoundError(f"Channel {channel_id} not found")
            
        has_time = bool(meta_result.result_rows[0][0])

        if has_time:
            result = self.client._execute(
                f"""
                SELECT min(timestamp), max(timestamp), count()
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                """,
                {"channel_id": channel_id}
            )
            
            if result.result_rows and result.result_rows[0] and result.result_rows[0][0]:
                min_time, max_time, total_points = result.result_rows[0]
                return TimeRange(
                    channel_id=channel_id,
                    has_time=True,
                    min_timestamp=min_time.timestamp(),
                    max_timestamp=max_time.timestamp(),
                    min_iso=min_time.isoformat() + "Z",
                    max_iso=max_time.isoformat() + "Z",
                    total_points=total_points,
                )
        else:
            result = self.client._execute(
                f"""
                SELECT min(sample_index), max(sample_index), count()
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                """,
                {"channel_id": channel_id}
            )
            
            if result.result_rows and result.result_rows[0]:
                min_index, max_index, total_points = result.result_rows[0]
                return TimeRange(
                    channel_id=channel_id,
                    has_time=False,
                    min_index=int(min_index) if min_index is not None else None,
                    max_index=int(max_index) if max_index is not None else None,
                    total_points=int(total_points),
                )

        return TimeRange(
            channel_id=channel_id,
            has_time=has_time,
            total_points=0
        )

    def get_downsampled_data_clickhouse(
        self,
        channel_id: UUID,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        points: int = 2000,
    ) -> pd.DataFrame:
        """Get downsampled data using ClickHouse native sampling."""
        # Check channel metadata
        meta_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id}
        )
        
        if not meta_result.result_rows:
            raise ChannelNotFoundError(f"Channel {channel_id} not found")
            
        has_time = bool(meta_result.result_rows[0][0])

        if has_time:
            query = f"""
                SELECT toUnixTimestamp(timestamp) as time, value
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 1
                {{time_filter}}
                ORDER BY timestamp
                LIMIT %(limit)s
            """
            time_filter = ""
            params = {"channel_id": channel_id, "limit": points * 2}
            
            if start_timestamp is not None:
                time_filter += " AND timestamp >= fromUnixTimestamp(%(start_ts)s)"
                params["start_ts"] = start_timestamp
            if end_timestamp is not None:
                time_filter += " AND timestamp <= fromUnixTimestamp(%(end_ts)s)"
                params["end_ts"] = end_timestamp
                
            query = query.format(time_filter=time_filter)
        else:
            query = f"""
                SELECT sample_index as time, value
                FROM {self.client.database}.sensor_data
                WHERE channel_id = %(channel_id)s AND is_time_series = 0
                {{index_filter}}
                ORDER BY sample_index
                LIMIT %(limit)s
            """
            index_filter = ""
            params = {"channel_id": channel_id, "limit": points * 2}
            
            if start_timestamp is not None:
                index_filter += " AND sample_index >= %(start_idx)s"
                params["start_idx"] = int(start_timestamp)
            if end_timestamp is not None:
                index_filter += " AND sample_index <= %(end_idx)s"
                params["end_idx"] = int(end_timestamp)
                
            query = query.format(index_filter=index_filter)

        result = self.client._execute(query, params)
        df = pd.DataFrame(result.result_rows, columns=["time", "value"])
        
        # Simple uniform downsampling if we got more data than requested
        if len(df) > points:
            step = max(1, len(df) // points)
            df = df.iloc[::step].head(points)
            
        return df