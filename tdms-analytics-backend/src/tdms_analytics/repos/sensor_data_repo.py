import logging
from typing import Dict, List, Optional
from uuid import UUID

import numpy as np
import pandas as pd
import pyarrow as pa

from ..app_settings import app_settings
from ..clients.clickhouse import ClickHouseClient
from ..entities.sensor_data import TimeRange
from ..exceptions.tdms_exceptions import ChannelNotFoundError

logger = logging.getLogger(__name__)


class SensorDataRepository:
    """Repository for sensor data operations."""

    def __init__(self, clickhouse_client: ClickHouseClient):
        self.client = clickhouse_client

    def _to_arrow_table(self, columns: List[str], data_dict: Dict[str, any]) -> pa.Table:
        """
        Build a pyarrow.Table with proper types to map to ClickHouse schema:
          - dataset_id, channel_id: UUID columns -> send as strings (CH will parse to UUID)
          - timestamp: Arrow timestamp(us) -> CH DateTime64(6)
          - sample_index: uint64
          - value: float64
          - is_time_series: uint8
        """
        arrays = {}
        for col in columns:
            v = data_dict[col]
            # Normalize to numpy / pandas first
            if isinstance(v, pd.Series):
                v = v.to_numpy()
            # Handle by name to ensure correct Arrow types
            if col in ("dataset_id", "channel_id"):
                # Convert UUIDs to strings once; avoid Python loop overhead on large arrays
                if isinstance(v, np.ndarray):
                    arr = pa.array(v.astype(object).tolist(), type=pa.string())
                else:
                    arr = pa.array([str(x) for x in v], type=pa.string())
            elif col == "timestamp":
                # Expect int64 microseconds since epoch OR pandas datetime64[ns]
                if isinstance(v, np.ndarray) and v.dtype == "datetime64[ns]":
                    # convert ns -> us
                    v = (v.astype("datetime64[us]").astype("int64"))
                    arr = pa.array(v, type=pa.timestamp("us"))
                elif isinstance(v, np.ndarray) and np.issubdtype(v.dtype, np.integer):
                    arr = pa.array(v, type=pa.timestamp("us"))
                else:
                    # pandas DatetimeIndex or list-like
                    ts = pd.to_datetime(v).view("int64") // 1000  # ns -> us
                    arr = pa.array(ts, type=pa.timestamp("us"))
            elif col == "sample_index":
                if isinstance(v, np.ndarray):
                    arr = pa.array(v, type=pa.uint64())
                else:
                    arr = pa.array(np.asarray(v, dtype=np.uint64), type=pa.uint64())
            elif col == "value":
                if isinstance(v, np.ndarray) and v.dtype == np.float64:
                    arr = pa.array(v, type=pa.float64())
                else:
                    arr = pa.array(np.asarray(v, dtype=np.float64), type=pa.float64())
            elif col == "is_time_series":
                if isinstance(v, np.ndarray):
                    arr = pa.array(v, type=pa.uint8())
                else:
                    arr = pa.array(np.asarray(v, dtype=np.uint8), type=pa.uint8())
            else:
                # Fallback generic
                arr = pa.array(v)
            arrays[col] = arr

        return pa.table(arrays)

    def bulk_insert_columnar(
        self,
        columns: List[str],
        data_dict: Dict[str, any],
        chunk_size: int = None,
    ) -> None:
        """Insert sensor data using true columnar Arrow path (fast)."""
        if chunk_size is None:
            chunk_size = app_settings.chunk_size

        lengths = {len(data_dict[col]) for col in columns}
        if len(lengths) != 1:
            raise ValueError("All columns must have the same length")

        total_rows = int(next(iter(lengths)))
        if total_rows == 0:
            return

        table = self._to_arrow_table(columns, data_dict)

        # Chunked insert to keep memory reasonable, but use big blocks (200k–1M)
        for start in range(0, total_rows, chunk_size):
            end = min(start + chunk_size, total_rows)
            chunk = table.slice(start, end - start)
            self.client.insert_arrow_table(f"{self.client.database}.sensor_data", chunk)

    # ===== lecture (inchangé) =====
    def get_channel_data(
        self,
        channel_id: UUID,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        limit: int = 50000,
    ) -> pd.DataFrame:
        channel_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
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
        meta_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
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
                {"channel_id": channel_id},
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
                {"channel_id": channel_id},
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

        return TimeRange(channel_id=channel_id, has_time=has_time, total_points=0)

    def get_downsampled_data_clickhouse(
        self,
        channel_id: UUID,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        points: int = 2000,
    ) -> pd.DataFrame:
        meta_result = self.client._execute(
            f"SELECT has_time FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id},
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
        if len(df) > points:
            step = max(1, len(df) // points)
            df = df.iloc[::step].head(points)
        return df
