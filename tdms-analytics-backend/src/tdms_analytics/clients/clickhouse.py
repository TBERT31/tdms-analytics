import logging
import threading
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import clickhouse_connect
import numpy as np
import pandas as pd
from clickhouse_connect.driver import Client

from ..app_settings import app_settings
from ..exceptions.tdms_exceptions import ClickHouseConnectionError

logger = logging.getLogger(__name__)


class ClickHouseClient:
    """ClickHouse client with flat table architecture."""

    def __init__(self):
        self._client: Optional[Client] = None
        self._lock = threading.RLock()
        self.database = app_settings.clickhouse_database
        self._ensure_database_exists()
        self._connect()
        self._create_tables()

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
        """Establish ClickHouse connection."""
        try:
            self._client = clickhouse_connect.get_client(
                host=app_settings.clickhouse_host,
                port=app_settings.clickhouse_port,
                username=app_settings.clickhouse_user,
                password=app_settings.clickhouse_password,
                database=self.database,
                compress=True,
            )
            logger.info(f"ClickHouse connection established to database {self.database}")
        except Exception as e:
            logger.error(f"Failed to connect to ClickHouse: {e}")
            raise ClickHouseConnectionError(f"Connection failed: {e}") from e

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
        """Thread-safe data insertion."""
        with self._lock:
            if not self._client:
                raise ClickHouseConnectionError("No active connection")
            try:
                self._client.insert(table, data, column_names=column_names)
            except Exception as e:
                logger.error(f"Insert failed: {e}")
                raise

    def _create_tables(self) -> None:
        """Create simplified table structure."""
        sensor_readings_table = f"""
            CREATE TABLE IF NOT EXISTS sensor_readings (
                filename String,
                group_name String,
                channel_name String,
                unit String,
                sample_index UInt64,
                value Float64,
                ingestion_time DateTime DEFAULT now()
            ) ENGINE = MergeTree()
            PARTITION BY toYYYYMM(ingestion_time)
            ORDER BY (filename, group_name, channel_name, sample_index)
            SETTINGS index_granularity = 8192
        """

        try:
            self._execute(sensor_readings_table)
            logger.info("Table sensor_readings created/verified")
        except Exception as e:
            logger.error(f"Failed to create table sensor_readings: {e}")
            raise

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