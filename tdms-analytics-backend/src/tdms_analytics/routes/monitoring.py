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

from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


@router.delete("/audit/cleanup-orphan-channels")
async def cleanup_orphan_channels(
    dry_run: bool = True,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """
    Delete channels without valid dataset.
    
    Args:
        dry_run: If True, only show what would be deleted without actually deleting
    """
    # Find orphan channels
    orphans = clickhouse_client._execute("""
        SELECT c.channel_id, c.dataset_id, c.channel_name
        FROM channels AS c
        LEFT JOIN datasets AS d ON c.dataset_id = d.dataset_id
        WHERE d.dataset_id IS NULL
    """)
    
    count = len(orphans.result_rows)
    
    if count == 0:
        return {"message": "No orphan channels found", "deleted": 0}
    
    if dry_run:
        return {
            "message": f"DRY RUN: Would delete {count} orphan channels",
            "channels": orphans.result_rows,
            "deleted": 0
        }
    
    # Actually delete
    try:
        clickhouse_client._execute("""
            ALTER TABLE channels DELETE 
            WHERE channel_id IN (
                SELECT c.channel_id
                FROM channels AS c
                LEFT JOIN datasets AS d ON c.dataset_id = d.dataset_id
                WHERE d.dataset_id IS NULL
            )
        """)
        logger.info(f"Deleted {count} orphan channels")
        return {"message": f"Deleted {count} orphan channels", "deleted": count}
    except Exception as e:
        logger.error(f"Failed to delete orphan channels: {e}")
        raise HTTPException(500, f"Cleanup failed: {str(e)}")


@router.delete("/audit/cleanup-orphan-points")
async def cleanup_orphan_points(
    dry_run: bool = True,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """
    Delete sensor_data without valid channel.
    
    Args:
        dry_run: If True, only show what would be deleted without actually deleting
    """
    # Count orphan points
    count_result = clickhouse_client._execute("""
        SELECT count() as cnt
        FROM sensor_data AS s
        LEFT JOIN channels AS c ON s.channel_id = c.channel_id
        WHERE c.channel_id IS NULL
    """)
    
    count = count_result.result_rows[0][0] if count_result.result_rows else 0
    
    if count == 0:
        return {"message": "No orphan sensor_data found", "deleted": 0}
    
    if dry_run:
        # Sample orphans
        sample = clickhouse_client._execute("""
            SELECT s.dataset_id, s.channel_id, count() as points
            FROM sensor_data AS s
            LEFT JOIN channels AS c ON s.channel_id = c.channel_id
            WHERE c.channel_id IS NULL
            GROUP BY s.dataset_id, s.channel_id
            LIMIT 10
        """)
        return {
            "message": f"DRY RUN: Would delete {count} orphan sensor_data points",
            "sample": sample.result_rows,
            "deleted": 0
        }
    
    # Actually delete
    try:
        clickhouse_client._execute("""
            ALTER TABLE sensor_data DELETE 
            WHERE channel_id IN (
                SELECT s.channel_id
                FROM sensor_data AS s
                LEFT JOIN channels AS c ON s.channel_id = c.channel_id
                WHERE c.channel_id IS NULL
            )
        """)
        logger.info(f"Deleted {count} orphan sensor_data points")
        return {"message": f"Deleted {count} orphan sensor_data points", "deleted": count}
    except Exception as e:
        logger.error(f"Failed to delete orphan points: {e}")
        raise HTTPException(500, f"Cleanup failed: {str(e)}")


@router.delete("/audit/cleanup-empty-channels")
async def cleanup_empty_channels(
    dry_run: bool = True,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """
    Delete channels that have no sensor_data.
    
    Args:
        dry_run: If True, only show what would be deleted without actually deleting
    """
    # Find channels without data
    empty_channels = clickhouse_client._execute("""
        SELECT c.channel_id, c.dataset_id, c.channel_name, c.n_rows
        FROM channels AS c
        LEFT JOIN (
            SELECT channel_id, count() as actual_count
            FROM sensor_data
            GROUP BY channel_id
        ) AS s ON c.channel_id = s.channel_id
        WHERE s.actual_count IS NULL OR s.actual_count = 0
    """)
    
    count = len(empty_channels.result_rows)
    
    if count == 0:
        return {"message": "No empty channels found", "deleted": 0}
    
    if dry_run:
        return {
            "message": f"DRY RUN: Would delete {count} empty channels",
            "channels": empty_channels.result_rows,
            "deleted": 0
        }
    
    # Actually delete
    try:
        clickhouse_client._execute("""
            ALTER TABLE channels DELETE 
            WHERE channel_id IN (
                SELECT c.channel_id
                FROM channels AS c
                LEFT JOIN (
                    SELECT channel_id, count() as actual_count
                    FROM sensor_data
                    GROUP BY channel_id
                ) AS s ON c.channel_id = s.channel_id
                WHERE s.actual_count IS NULL OR s.actual_count = 0
            )
        """)
        logger.info(f"Deleted {count} empty channels")
        return {"message": f"Deleted {count} empty channels", "deleted": count}
    except Exception as e:
        logger.error(f"Failed to delete empty channels: {e}")
        raise HTTPException(500, f"Cleanup failed: {str(e)}")


@router.delete("/audit/cleanup-all")
async def cleanup_all(
    dry_run: bool = True,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """
    Run all cleanup operations in order:
    1. Orphan sensor_data (points without channel)
    2. Empty channels (channels without data)
    3. Orphan channels (channels without dataset)
    
    Args:
        dry_run: If True, only show what would be deleted without actually deleting
    """
    results = {}
    
    # Step 1: Clean orphan points first
    points_result = await cleanup_orphan_points(dry_run, clickhouse_client)
    results["orphan_points"] = points_result
    
    # Step 2: Clean empty channels
    empty_result = await cleanup_empty_channels(dry_run, clickhouse_client)
    results["empty_channels"] = empty_result
    
    # Step 3: Clean orphan channels
    orphan_result = await cleanup_orphan_channels(dry_run, clickhouse_client)
    results["orphan_channels"] = orphan_result
    
    total_deleted = (
        points_result.get("deleted", 0) + 
        empty_result.get("deleted", 0) + 
        orphan_result.get("deleted", 0)
    )
    
    return {
        "message": "Cleanup completed" if not dry_run else "DRY RUN completed",
        "total_deleted": total_deleted,
        "details": results
    }