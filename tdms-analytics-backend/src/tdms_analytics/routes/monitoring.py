from fastapi import APIRouter, Depends
from ..dependencies.clickhouse import get_clickhouse_client
from ..clients.clickhouse import ClickHouseClient

router = APIRouter()

@router.get("/audit/orphan-channels")
async def get_orphan_channels(
    limit: int = 100,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Check for channels without valid dataset."""
    result = clickhouse_client._execute(
        f"SELECT * FROM audit_orphans_channels ORDER BY event_time DESC LIMIT {limit}"
    )
    return {"orphans": result.result_rows, "count": len(result.result_rows)}

@router.get("/audit/orphan-points")
async def get_orphan_points(
    limit: int = 100,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Check for sensor_data without valid channel."""
    result = clickhouse_client._execute(
        f"SELECT * FROM audit_orphans_points ORDER BY event_time DESC LIMIT {limit}"
    )
    return {"orphans": result.result_rows, "count": len(result.result_rows)}

@router.get("/audit/check-integrity")
async def check_data_integrity(
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Check for existing data integrity issues."""
    
    # Channels sans dataset
    orphan_channels = clickhouse_client._execute("""
        SELECT c.channel_id, c.dataset_id, c.group_name, c.channel_name
        FROM channels AS c
        LEFT JOIN datasets AS d ON c.dataset_id = d.dataset_id
        WHERE d.dataset_id IS NULL
    """)
    
    # Channels sans sensor_data
    channels_without_data = clickhouse_client._execute("""
        SELECT 
            c.channel_id, 
            c.dataset_id, 
            c.channel_name, 
            c.n_rows as expected_rows,
            count(s.value) as actual_rows
        FROM channels AS c
        LEFT JOIN sensor_data AS s ON c.channel_id = s.channel_id
        GROUP BY c.channel_id, c.dataset_id, c.channel_name, c.n_rows
        HAVING actual_rows < expected_rows
    """)
    
    return {
        "orphan_channels": {
            "count": len(orphan_channels.result_rows),
            "data": orphan_channels.result_rows
        },
        "channels_with_missing_data": {
            "count": len(channels_without_data.result_rows),
            "data": channels_without_data.result_rows
        }
    }