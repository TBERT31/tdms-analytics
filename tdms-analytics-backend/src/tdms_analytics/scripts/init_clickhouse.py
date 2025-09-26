#!/usr/bin/env python3
"""
Script d'initialisation ClickHouse pour TDMS Analytics.
Usage: poetry run init_clickhouse
"""

import logging
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from tdms_analytics.app_settings import app_settings
from tdms_analytics.exceptions.tdms_exceptions import ClickHouseConnectionError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    """Initialize ClickHouse database and tables."""
    try:
        logger.info("Starting ClickHouse initialization...")
        logger.info(f"Connecting to {app_settings.clickhouse_host}:{app_settings.clickhouse_port}")
        logger.info(f"Target database: {app_settings.clickhouse_database}")
        
        # Import ici pour éviter les problèmes de circular import
        from tdms_analytics.clients.clickhouse import ClickHouseClient
        
        # Initialize client (this will create database and tables)
        logger.info("Creating ClickHouse client...")
        client = ClickHouseClient()
        
        # Test connection
        logger.info("Testing connection...")
        if client.health_check():
            logger.info("✅ ClickHouse connection successful")
        else:
            logger.error("❌ ClickHouse health check failed")
            return 1
            
        # Verify tables exist
        logger.info("Checking tables...")
        result = client._execute("SHOW TABLES")
        tables = {row[0] for row in result.result_rows}
        expected_tables = {"datasets", "channels", "sensor_data"}
        
        if expected_tables.issubset(tables):
            logger.info(f"✅ All required tables found: {sorted(tables)}")
        else:
            missing = expected_tables - tables
            logger.warning(f"⚠️ Missing tables: {missing}")
            
        # Display table counts
        logger.info("Table statistics:")
        for table in expected_tables:
            if table in tables:
                try:
                    count_result = client._execute(f"SELECT count() FROM {table}")
                    count = count_result.result_rows[0][0] if count_result.result_rows else 0
                    logger.info(f"  {table}: {count} rows")
                except Exception as e:
                    logger.warning(f"  {table}: Could not get count - {e}")
        
        # Test basic operations
        logger.info("Testing basic operations...")
        try:
            test_result = client._execute("SELECT version()")
            version = test_result.result_rows[0][0] if test_result.result_rows else "unknown"
            logger.info(f"ClickHouse version: {version}")
        except Exception as e:
            logger.warning(f"Could not get ClickHouse version: {e}")
        
        # Cleanup
        client.close()
        
        logger.info("✅ ClickHouse initialization completed successfully")
        logger.info("You can now start ingesting TDMS files!")
        return 0

    except ClickHouseConnectionError as e:
        logger.error(f"❌ ClickHouse connection error: {e}")
        return 1
    except Exception as e:
        logger.error(f"❌ Unexpected error during initialization: {e}")
        logger.exception("Full error details:")
        return 1


if __name__ == "__main__":
    sys.exit(main())