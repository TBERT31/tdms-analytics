import logging
from typing import Any, Dict, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query

from ..app_settings import app_settings
from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client
from ..repos.sensor_readings_repo import SensorReadingsRepository
from ..utils.lttb import smart_downsample_production

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/window")
async def get_window(
    filename: str = Query(..., description="Dataset filename"),
    group_name: str = Query(..., description="Group name"),
    channel_name: str = Query(..., description="Channel name"),
    start_index: Optional[int] = Query(None, description="Start sample index"),
    end_index: Optional[int] = Query(None, description="End sample index"),
    points: int = Query(
        app_settings.default_points, 
        ge=app_settings.points_min, 
        le=app_settings.points_max
    ),
    method: str = Query("lttb", description="lttb|uniform"),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> Dict[str, Any]:
    """Get windowed sensor data with downsampling."""
    try:
        sensor_repo = SensorReadingsRepository(clickhouse_client)
        
        # Get data
        df = sensor_repo.get_channel_data(
            filename=filename,
            group_name=group_name,
            channel_name=channel_name,
            start_index=start_index,
            end_index=end_index,
            limit=app_settings.default_limit,
        )
        
        original_points = len(df)
        
        # Apply downsampling if needed
        if len(df) > points:
            if method == "lttb":
                df = smart_downsample_production(df, points)
            else:  # uniform
                bins = np.linspace(0, len(df) - 1, points, dtype=int)
                df = df.iloc[bins]

        if len(df) == 0:
            return {
                "x": [],
                "y": [],
                "filename": filename,
                "group_name": group_name,
                "channel_name": channel_name,
                "method": method,
                "original_points": 0,
                "returned_points": 0,
            }

        return {
            "x": df["time"].astype(int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "filename": filename,
            "group_name": group_name,
            "channel_name": channel_name,
            "method": method,
            "original_points": original_points,
            "returned_points": len(df),
        }

    except Exception as e:
        logger.error(f"Error in window endpoint: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")