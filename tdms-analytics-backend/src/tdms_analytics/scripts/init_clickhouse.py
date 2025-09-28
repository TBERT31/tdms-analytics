"""
Simplified ClickHouse initialization script.
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from tdms_analytics.app_settings import app_settings
from tdms_analytics.exceptions.tdms_exceptions import ClickHouseConnectionError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    """Initialize simplified ClickHouse schema."""
    try:
        logger.info("Starting simplified ClickHouse initialization...")
        logger.info(f"Connecting to {app_settings.clickhouse_host}:{app_settings.clickhouse_port}")
        logger.info(f"Target database: {app_settings.clickhouse_database}")
        
        from tdms_analytics.clients.clickhouse import ClickHouseClient
        
        logger.info("Creating ClickHouse client...")
        client = ClickHouseClient()
        
        # Test connection
        logger.info("Testing connection...")
        if client.health_check():
            logger.info("✅ ClickHouse connection successful")
        else:
            logger.error("❌ ClickHouse health check failed")
            return 1
            
        # Check table
        logger.info("Checking simplified table...")
        result = client._execute("SHOW TABLES")
        tables = {row[0] for row in result.result_rows}
        
        if "sensor_readings" in tables:
            logger.info("✅ Table sensor_readings found")
            count_result = client._execute("SELECT count() FROM sensor_readings")
            count = count_result.result_rows[0][0] if count_result.result_rows else 0
            logger.info(f"  sensor_readings: {count} rows")
        else:
            logger.warning("⚠️ Table sensor_readings not found")
            
        # Test basic operations
        try:
            test_result = client._execute("SELECT version()")
            version = test_result.result_rows[0][0] if test_result.result_rows else "unknown"
            logger.info(f"ClickHouse version: {version}")
        except Exception as e:
            logger.warning(f"Could not get ClickHouse version: {e}")
        
        client.close()
        
        logger.info("✅ Simplified ClickHouse initialization completed")
        logger.info("Ready for TDMS ingestion!")
        return 0

    except ClickHouseConnectionError as e:
        logger.error(f"❌ ClickHouse connection error: {e}")
        return 1
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())