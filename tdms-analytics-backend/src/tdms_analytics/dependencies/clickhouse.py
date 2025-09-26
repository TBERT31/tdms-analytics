from functools import lru_cache

from ..clients.clickhouse import ClickHouseClient


@lru_cache()
def get_clickhouse_client() -> ClickHouseClient:
    """Get ClickHouse client instance (singleton)."""
    return ClickHouseClient()