import logging
from datetime import datetime as dt
from typing import Any, Dict, Optional
from uuid import UUID

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..app_settings import app_settings
from ..clients.clickhouse import ClickHouseClient
from ..dependencies.clickhouse import get_clickhouse_client
from ..dependencies.auth import get_current_user_id
from ..enums.downsampling import DownsamplingMethod
from ..exceptions.tdms_exceptions import ChannelNotFoundError, ForbiddenAccessError
from ..repos.sensor_data_repo import SensorDataRepository
from ..repos.channel_repo import ChannelRepository
from ..repos.dataset_repo import DatasetRepository
from ..utils.lttb import smart_downsample_production
from ..utils.arrow_response import (
    client_wants_arrow,
    dataframe_to_arrow_streaming_response,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_channel_ownership(
    channel_id: UUID,
    user_id: str,
    clickhouse_client: ClickHouseClient
) -> None:
    """Verify that the user owns the dataset associated with this channel."""
    channel_repo = ChannelRepository(clickhouse_client)
    channel = channel_repo.get_by_id(channel_id)
    
    dataset_repo = DatasetRepository(clickhouse_client)
    dataset_repo.get_by_id(channel.dataset_id, user_id=user_id)


@router.get("/window")
async def get_window(
    request: Request,
    channel_id: UUID = Query(..., description="UUID du canal"),
    start: Optional[str] = Query(None, description="ISO date si has_time"),
    end: Optional[str] = Query(None, description="ISO date si has_time"),
    start_sec: Optional[float] = Query(None, description="fenêtre relative en secondes"),
    end_sec: Optional[float] = Query(None, description="fenêtre relative en secondes"),
    relative: bool = Query(False, description="temps en secondes depuis le début"),
    points: int = Query(
        app_settings.default_points, 
        ge=app_settings.points_min, 
        le=app_settings.points_max
    ),
    method: DownsamplingMethod = Query(
        DownsamplingMethod.LTTB, 
        description="lttb|uniform|clickhouse - LTTB par défaut"
    ),
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> Dict[str, Any]:
    """Get windowed sensor data with downsampling (with ownership check)."""
    try:
        # Verify ownership
        await verify_channel_ownership(channel_id, user_id, clickhouse_client)
        
        sensor_repo = SensorDataRepository(clickhouse_client)
        
        # Get time range information
        time_range = sensor_repo.get_time_range(channel_id)
        has_time = time_range.has_time

        # Calculate timestamps
        start_timestamp = None
        end_timestamp = None

        if has_time:
            if start:
                start_timestamp = dt.fromisoformat(start.replace("Z", "+00:00")).timestamp()
            elif start_sec is not None and time_range.min_timestamp is not None:
                start_timestamp = time_range.min_timestamp + start_sec

            if end:
                end_timestamp = dt.fromisoformat(end.replace("Z", "+00:00")).timestamp()
            elif end_sec is not None and time_range.min_timestamp is not None:
                end_timestamp = time_range.min_timestamp + end_sec
        else:
            if start:
                start_timestamp = float(start)
            if end:
                end_timestamp = float(end)

        # Get data based on method
        if method == DownsamplingMethod.CLICKHOUSE:
            df = sensor_repo.get_downsampled_data_clickhouse(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                points=points,
            )
            original_points = points
        else:
            # Get raw data first
            df = sensor_repo.get_channel_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                limit=app_settings.default_limit,
            )
            original_points = len(df)
            
            # Apply downsampling if needed
            if len(df) > points:
                if method == DownsamplingMethod.LTTB:
                    df = smart_downsample_production(df, points)
                else:  # uniform
                    bins = np.linspace(0, len(df) - 1, points, dtype=int)
                    df = df.iloc[bins]

        # Get unit information
        unit = ""
        if len(df) > 0:
            unit_result = clickhouse_client._execute(
                f"SELECT unit FROM {clickhouse_client.database}.channels WHERE channel_id = %(channel_id)s LIMIT 1",
                {"channel_id": channel_id}
            )
            unit = unit_result.result_rows[0][0] if unit_result.result_rows else ""

        if len(df) == 0:
            return {
                "x": [],
                "y": [],
                "unit": unit,
                "has_time": has_time,
                "method": method.value,
                "original_points": 0,
                "returned_points": 0,
            }

        # Apply relative time if requested
        if relative and has_time:
            min_time = df["time"].min()
            df["time"] = df["time"] - min_time

        # Arrow response if requested
        if client_wants_arrow(request):
            arrow_df = df[["time", "value"]].copy()
            return dataframe_to_arrow_streaming_response(arrow_df, filename="window.arrow")

        return {
            "x": df["time"].astype(float if has_time else int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": unit,
            "has_time": has_time,
            "x_unit": "s" if relative else "",
            "method": method.value,
            "original_points": original_points,
            "returned_points": len(df),
        }

    except ForbiddenAccessError:
        raise HTTPException(403, "Access forbidden - you don't own this channel's dataset")
    except ChannelNotFoundError:
        raise HTTPException(404, "Channel not found")
    except Exception as e:
        logger.error(f"Error in window endpoint: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")


@router.get("/get_window_filtered")
async def get_window_filtered(
    request: Request,
    channel_id: UUID = Query(..., description="UUID du canal"),
    start_timestamp: Optional[float] = Query(None, description="Timestamp Unix de début"),
    end_timestamp: Optional[float] = Query(None, description="Timestamp Unix de fin"),
    cursor: Optional[float] = Query(None, description="Curseur temporel pour pagination"),
    limit: int = Query(
        app_settings.default_limit, 
        ge=app_settings.limit_min, 
        le=app_settings.limit_max
    ),
    points: int = Query(
        app_settings.default_points, 
        ge=app_settings.points_min, 
        le=app_settings.points_max
    ),
    method: DownsamplingMethod = Query(
        DownsamplingMethod.LTTB, 
        description="lttb|uniform|clickhouse - LTTB par défaut"
    ),
    user_id: str = Depends(get_current_user_id),
    clickhouse_client: ClickHouseClient = Depends(get_clickhouse_client),
) -> Dict[str, Any]:
    """Get filtered and paginated sensor data window (with ownership check)."""
    try:
        # Verify ownership
        await verify_channel_ownership(channel_id, user_id, clickhouse_client)
        
        sensor_repo = SensorDataRepository(clickhouse_client)
        
        # Get time range information
        time_range = sensor_repo.get_time_range(channel_id)

        # Use cursor as start if provided
        if cursor is not None:
            start_timestamp = cursor

        # Get data based on method
        if method == DownsamplingMethod.CLICKHOUSE:
            df = sensor_repo.get_downsampled_data_clickhouse(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                points=points,
            )
            original_points = points
            has_more = False
            next_cursor = None
        else:
            # Get raw data
            df = sensor_repo.get_channel_data(
                channel_id=channel_id,
                start_timestamp=start_timestamp,
                end_timestamp=end_timestamp,
                limit=limit,
            )
            original_points = len(df)
            has_more = len(df) >= limit

            # Apply downsampling if needed
            if len(df) > points:
                if method == DownsamplingMethod.LTTB:
                    df = smart_downsample_production(df, points)
                else:  # uniform
                    bins = np.linspace(0, len(df) - 1, points, dtype=int)
                    df = df.iloc[bins]

            next_cursor = float(df["time"].iloc[-1]) if len(df) > 0 and has_more else None

        # Get unit information
        unit_result = clickhouse_client._execute(
            f"SELECT unit FROM {clickhouse_client.database}.channels WHERE channel_id = %(channel_id)s LIMIT 1",
            {"channel_id": channel_id}
        )
        unit = unit_result.result_rows[0][0] if unit_result.result_rows else ""

        if len(df) == 0:
            return {
                "x": [],
                "y": [],
                "unit": unit,
                "has_time": time_range.has_time,
                "original_points": 0,
                "sampled_points": 0,
                "has_more": False,
                "next_cursor": None,
                "method": method.value,
                "performance": {"optimization": "clickhouse_native"},
            }
        
        # Arrow response if requested
        if client_wants_arrow(request):
            arrow_df = df[["time", "value"]].copy()
            return dataframe_to_arrow_streaming_response(arrow_df, filename="window_filtered.arrow")

        return {
            "x": df["time"].astype(float if time_range.has_time else int).tolist(),
            "y": df["value"].astype(float).tolist(),
            "unit": unit,
            "has_time": time_range.has_time,
            "original_points": original_points,
            "sampled_points": len(df),
            "has_more": has_more,
            "next_cursor": next_cursor,
            "method": method.value,
            "performance": {
                "optimization": "clickhouse_native_query" if method == DownsamplingMethod.CLICKHOUSE else "python_downsample",
                "filtered_points": original_points,
                "limited_points": len(df),
            },
        }

    except ForbiddenAccessError:
        raise HTTPException(403, "Access forbidden - you don't own this channel's dataset")
    except ChannelNotFoundError:
        raise HTTPException(404, "Channel not found")
    except Exception as e:
        logger.error(f"Error in filtered window endpoint: {e}")
        raise HTTPException(500, f"Database error: {str(e)}")