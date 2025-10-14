import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..dependencies.clickhouse import get_clickhouse_client
from ..dependencies.auth import get_current_user_id
from ..clients.clickhouse import ClickHouseClient
from ..repos.dataset_repo import DatasetRepository
from ..utils.io_tdms import tdms_to_clickhouse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest")
async def ingest_tdms_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> Dict[str, Any]:
    """Ingest TDMS file into ClickHouse (associated with authenticated user)."""
    if not file.filename or not file.filename.endswith(('.tdms', '.TDMS')):
        raise HTTPException(400, "Only TDMS files are supported")

    with NamedTemporaryFile(delete=False, suffix='.tdms') as tmp_file:
        try:
            # Write uploaded content to temporary file
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            # Generate new dataset ID
            dataset_repo = DatasetRepository(clickhouse_client)
            dataset_id = clickhouse_client.new_dataset_id()
            
            logger.info(f"Starting TDMS ingestion for dataset {dataset_id}, user {user_id}")
            
            # Process TDMS file with user_id
            channels_meta = tdms_to_clickhouse(
                tmp_file.name, 
                dataset_id,
                user_id,  # Pass user_id to the ingestion function
                file.filename,
                clickhouse_client
            )
            
            logger.info(f"Ingestion completed: {len(channels_meta)} channels for user {user_id}")
            
            return {
                "dataset_id": str(dataset_id),
                "user_id": user_id,
                "filename": file.filename,
                "channels_count": len(channels_meta),
                "channels": channels_meta
            }
            
        except Exception as e:
            logger.error(f"Ingestion failed for user {user_id}: {e}")
            raise HTTPException(500, f"Ingestion failed: {str(e)}")
        finally:
            # Cleanup temporary file
            try:
                Path(tmp_file.name).unlink()
            except Exception:
                pass


@router.get("/api/constraints")
async def get_api_constraints() -> Dict[str, Any]:
    """Get API constraints for frontend."""
    from ..app_settings import app_settings
    return app_settings.get_api_constraints()