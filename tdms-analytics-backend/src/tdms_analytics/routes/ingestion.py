import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..dependencies.clickhouse import get_clickhouse_client
from ..clients.clickhouse import ClickHouseClient
from ..utils.io_tdms import tdms_to_clickhouse_simple

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest")
async def ingest_tdms_file(
    file: UploadFile = File(...),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> Dict[str, Any]:
    """Simplified TDMS file ingestion."""
    if not file.filename or not file.filename.endswith(('.tdms', '.TDMS')):
        raise HTTPException(400, "Only TDMS files are supported")

    with NamedTemporaryFile(delete=False, suffix='.tdms') as tmp_file:
        try:
            # Write uploaded content to temporary file
            content = await file.read()
            tmp_file.write(content)
            tmp_file.flush()
            
            logger.info(f"Starting simplified TDMS ingestion for {file.filename}")
            
            # Process TDMS file with simplified approach
            result = tdms_to_clickhouse_simple(
                tmp_file.name, 
                file.filename,
                clickhouse_client
            )
            
            logger.info(f"Ingestion completed: {result['channels_processed']} channels, {result['total_points']} points")
            
            return {
                "filename": file.filename,
                "status": "success",
                "channels_processed": result["channels_processed"],
                "total_points": result["total_points"],
                "processing_time": result["processing_time"]
            }
            
        except Exception as e:
            logger.error(f"Ingestion failed: {e}")
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