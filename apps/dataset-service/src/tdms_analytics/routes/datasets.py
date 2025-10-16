import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client
from ..dependencies.auth import get_current_user_id
from ..entities.dataset import Dataset
from ..exceptions.tdms_exceptions import DatasetNotFoundError, ForbiddenAccessError
from ..repos.dataset_repo import DatasetRepository

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/datasets", response_model=List[Dataset])
async def list_datasets(
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> List[Dataset]:
    """List all datasets for the authenticated user."""
    try:
        dataset_repo = DatasetRepository(clickhouse_client)
        return dataset_repo.get_all(user_id=user_id)
    except Exception as e:
        logger.error(f"Error retrieving datasets: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")


@router.get("/dataset_meta")
async def get_dataset_meta(
    dataset_id: UUID,
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Get dataset metadata including channels information (with ownership check)."""
    try:
        from ..repos.channel_repo import ChannelRepository
        
        dataset_repo = DatasetRepository(clickhouse_client)
        channel_repo = ChannelRepository(clickhouse_client)
        
        # Verify dataset exists AND user has access
        dataset = dataset_repo.get_by_id(dataset_id, user_id=user_id)
        channels = channel_repo.get_by_dataset_id(dataset_id)
        
        channel_info = [
            {
                "channel_id": str(ch.id),
                "group": ch.group_name,
                "channel": ch.channel_name,
                "rows": ch.n_rows,
                "has_time": ch.has_time,
                "unit": ch.unit,
            }
            for ch in channels
        ]
        
        return {
            "dataset_id": str(dataset_id),
            "user_id": dataset.user_id,
            "filename": dataset.filename,
            "channels": channel_info,
            "total_channels": len(channels),
            "total_points": dataset.total_points,
            "created_at": dataset.created_at.isoformat() + "Z",
            "storage": "clickhouse_partitioned_by_dataset_uuid",
        }
    except ForbiddenAccessError:
        raise HTTPException(403, "Access forbidden - you don't own this dataset")
    except DatasetNotFoundError:
        raise HTTPException(404, "Dataset not found")
    except Exception as e:
        logger.error(f"Error retrieving dataset metadata: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: UUID,
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
):
    """Delete a dataset and all associated data (with ownership check)."""
    try:
        dataset_repo = DatasetRepository(clickhouse_client)
        dataset_repo.delete(dataset_id, user_id=user_id)
        return {"message": f"Dataset {dataset_id} deleted successfully"}
    except ForbiddenAccessError:
        raise HTTPException(403, "Access forbidden - you don't own this dataset")
    except DatasetNotFoundError:
        raise HTTPException(404, "Dataset not found")
    except Exception as e:
        logger.error(f"Error deleting dataset: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")