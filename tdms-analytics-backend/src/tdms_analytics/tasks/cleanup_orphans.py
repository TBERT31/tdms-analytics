import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..clients.clickhouse import ClickHouseClient

logger = logging.getLogger(__name__)


async def run_automatic_cleanup(clickhouse_client: ClickHouseClient):
    """Run automatic data integrity cleanup."""
    logger.info("Starting automatic data cleanup...")
    
    try:
        # Delete orphan sensor_data
        result1 = clickhouse_client._execute("""
            ALTER TABLE sensor_data DELETE 
            WHERE channel_id IN (
                SELECT s.channel_id
                FROM sensor_data AS s
                LEFT JOIN channels AS c ON s.channel_id = c.channel_id
                WHERE c.channel_id IS NULL
            )
        """)
        
        # Delete empty channels
        result2 = clickhouse_client._execute("""
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
        
        # Delete orphan channels
        result3 = clickhouse_client._execute("""
            ALTER TABLE channels DELETE 
            WHERE channel_id IN (
                SELECT c.channel_id
                FROM channels AS c
                LEFT JOIN datasets AS d ON c.dataset_id = d.dataset_id
                WHERE d.dataset_id IS NULL
            )
        """)
        
        logger.info("Automatic cleanup completed successfully")
        
    except Exception as e:
        logger.error(f"Automatic cleanup failed: {e}")


def setup_cleanup_scheduler(clickhouse_client: ClickHouseClient) -> AsyncIOScheduler:
    """
    Setup automatic cleanup scheduler.
    
    Runs every day at 3:00 AM by default.
    """
    scheduler = AsyncIOScheduler()
    
    # Schedule cleanup: every day at 3:00 AM
    scheduler.add_job(
        run_automatic_cleanup,
        CronTrigger(hour=3, minute=0),  # Customize: hour=3 means 3 AM
        args=[clickhouse_client],
        id="data_integrity_cleanup",
        name="Data Integrity Cleanup",
        replace_existing=True
    )
    
    logger.info("Cleanup scheduler configured (runs daily at 3:00 AM)")
    
    return scheduler