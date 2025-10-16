import logging
from datetime import datetime as dt

from fastapi import APIRouter, Depends

from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health_check(
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Health check endpoint."""
    try:
        # Test ClickHouse connection
        clickhouse_client._execute("SELECT 1")
        clickhouse_status = "OK"
        
        # Check expected tables
        expected_tables = {"datasets", "channels", "sensor_data"}
        tables_result = clickhouse_client._execute("SHOW TABLES")
        found_tables = {row[0] for row in tables_result.result_rows}
        table_count = len(expected_tables.intersection(found_tables))
        
    except Exception as e:
        clickhouse_status = f"ERROR: {str(e)}"
        found_tables = set()
        table_count = 0

    is_healthy = (
        clickhouse_status == "OK" and 
        expected_tables.issubset(found_tables)
    )

    return {
        "status": "healthy" if is_healthy else "degraded",
        "clickhouse": clickhouse_status,
        "tables": f"{table_count}/{len(expected_tables)} expected tables found: {found_tables}",
        "architecture": "ClickHouse (UUID ids, partition=dataset_id, clickhouse-connect)",
        "timestamp": dt.utcnow().isoformat() + "Z",
    }