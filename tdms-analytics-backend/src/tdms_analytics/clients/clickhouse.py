import logging
import threading
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import clickhouse_connect
from clickhouse_connect.driver import Client

from ..app_settings import app_settings
from ..exceptions.tdms_exceptions import ClickHouseConnectionError

logger = logging.getLogger(__name__)


class ClickHouseClient:
    """Thread-safe ClickHouse client using clickhouse-connect."""

    def __init__(self):
        self._client: Optional[Client] = None
        self._lock = threading.RLock()
        self.database = app_settings.clickhouse_database
        self._ensure_database_exists()
        self._connect()
        self._create_tables()
        self._apply_session_settings()

    def _ensure_database_exists(self) -> None:
        """Create database if it doesn't exist."""
        try:
            admin_client = clickhouse_connect.get_client(
                host=app_settings.clickhouse_host,
                port=app_settings.clickhouse_port,
                username=app_settings.clickhouse_user,
                password=app_settings.clickhouse_password,
            )
            admin_client.command(f"CREATE DATABASE IF NOT EXISTS {self.database}")
            logger.info(f"Database {self.database} created/verified")
            admin_client.close()
        except Exception as e:
            logger.error(f"Database creation failed: {e}")
            raise ClickHouseConnectionError(f"Database creation failed: {e}") from e

    def _connect(self) -> None:
        """Establish ClickHouse connection to the specific database."""
        try:
            self._client = clickhouse_connect.get_client(
                host=app_settings.clickhouse_host,
                port=app_settings.clickhouse_port,
                username=app_settings.clickhouse_user,
                password=app_settings.clickhouse_password,
                database=self.database,
                compress=True,
                settings={
                    "async_insert": 1,
                    "wait_for_async_insert": 0,
                    "max_insert_block_size": app_settings.max_insert_block_size,
                    "max_threads": app_settings.max_threads,
                },
            )
            logger.info(f"ClickHouse connection established to database {self.database}")
        except Exception as e:
            logger.error(f"Failed to connect to ClickHouse: {e}")
            raise ClickHouseConnectionError(f"Connection failed: {e}") from e

    def _apply_session_settings(self) -> None:
        """Optional: enforce a few session-level settings explicitly."""
        try:
            self._execute("SET max_threads = %(t)s", {"t": app_settings.max_threads})
        except Exception as e:
            logger.warning(f"Could not apply session settings: {e}")

    def _execute(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> Any:
        """Thread-safe query execution."""
        with self._lock:
            if not self._client:
                raise ClickHouseConnectionError("No active connection")
            try:
                return self._client.query(query, parameters or {})
            except Exception as e:
                logger.error(f"Query execution failed: {e}")
                raise

    def _insert(self, table: str, data: List[List[Any]], column_names: List[str]) -> None:
        """Thread-safe data insertion (row-based fallback)."""
        with self._lock:
            if not self._client:
                raise ClickHouseConnectionError("No active connection")
            try:
                self._client.insert(table, data, column_names=column_names)
            except Exception as e:
                logger.error(f"Insert failed: {e}")
                raise

    def insert_arrow_table(self, table_name: str, arrow_table) -> None:
        """Insert a pyarrow.Table using ClickHouse native Arrow path."""
        with self._lock:
            if not self._client:
                raise ClickHouseConnectionError("No active connection")
            try:
                self._client.insert_arrow(table_name, arrow_table)
            except Exception as e:
                logger.error(f"Arrow insert failed: {e}")
                raise

    def _create_tables(self) -> None:
        """Create all required tables and views."""
        tables = {
            "datasets": f"""
                CREATE TABLE IF NOT EXISTS datasets (
                    dataset_id   UUID,
                    user_id      String,
                    filename     String,
                    created_at   DateTime64(3),
                    total_points UInt64
                ) ENGINE = MergeTree()
                ORDER BY (user_id, dataset_id)
            """,
            "channels": f"""
                CREATE TABLE IF NOT EXISTS channels (
                    channel_id   UUID,
                    dataset_id   UUID,
                    group_name   String,
                    channel_name String,
                    unit         String,
                    has_time     UInt8,
                    n_rows       UInt64
                ) ENGINE = MergeTree()
                ORDER BY (dataset_id, channel_id)
            """,
            "sensor_data": f"""
                CREATE TABLE IF NOT EXISTS sensor_data (
                    dataset_id     UUID,
                    channel_id     UUID,
                    timestamp      DateTime64(6) DEFAULT toDateTime64(0, 6),
                    sample_index   UInt64 DEFAULT 0,
                    value          Float64,
                    is_time_series UInt8 DEFAULT 0
                ) ENGINE = MergeTree()
                PARTITION BY dataset_id
                ORDER BY (dataset_id, channel_id, is_time_series, timestamp, sample_index)
                SETTINGS index_granularity = 8192
            """,
        }

        for table_name, ddl in tables.items():
            try:
                self._execute(ddl)
                logger.info(f"Table {table_name} created/verified")
            except Exception as e:
                logger.error(f"Failed to create table {table_name}: {e}")
                raise

    def new_dataset_id(self) -> UUID:
        """Generate new dataset UUID."""
        return uuid4()

    def new_channel_id(self) -> UUID:
        """Generate new channel UUID."""
        return uuid4()

    def health_check(self) -> bool:
        """Check if ClickHouse is healthy."""
        try:
            result = self._execute("SELECT 1")
            return bool(result.result_rows)
        except Exception:
            return False

    def close(self) -> None:
        """Close the connection."""
        if self._client:
            self._client.close()
            self._client = None