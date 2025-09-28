import logging
from typing import List

from fastapi import APIRouter, Depends

from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client
from ..repos.sensor_readings_repo import SensorReadingsRepository

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/datasets")
async def list_datasets(
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """List all datasets (filenames)."""
    try:
        sensor_repo = SensorReadingsRepository(clickhouse_client)
        return sensor_repo.get_datasets()
    except Exception as e:
        logger.error(f"Error retrieving datasets: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")