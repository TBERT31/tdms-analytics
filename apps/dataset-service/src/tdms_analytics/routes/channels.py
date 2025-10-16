import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client
from ..entities.channel import Channel
from ..entities.sensor_data import TimeRange
from ..exceptions.tdms_exceptions import ChannelNotFoundError, DatasetNotFoundError
from ..repos.channel_repo import ChannelRepository
from ..repos.sensor_data_repo import SensorDataRepository

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/datasets/{dataset_id}/channels", response_model=List[Channel])
async def list_channels(
    dataset_id: UUID,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> List[Channel]:
    """List all channels for a dataset."""
    try:
        channel_repo = ChannelRepository(clickhouse_client)
        channels = channel_repo.get_by_dataset_id(dataset_id)
        
        if not channels:
            raise HTTPException(404, "Dataset not found or has no channels")
            
        return channels
    except Exception as e:
        logger.error(f"Error retrieving channels: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")


@router.get("/channels/{channel_id}/time_range", response_model=TimeRange)
async def get_channel_time_range(
    channel_id: UUID,
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> TimeRange:
    """Get time range information for a channel."""
    try:
        sensor_repo = SensorDataRepository(clickhouse_client)
        return sensor_repo.get_time_range(channel_id)
    except ChannelNotFoundError:
        raise HTTPException(404, "Channel not found")
    except Exception as e:
        logger.error(f"Error retrieving time range: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")