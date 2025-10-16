from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel


class SensorDataPoint(BaseModel):
    """Single sensor data point."""
    dataset_id: UUID
    channel_id: UUID
    timestamp: Optional[datetime] = None
    sample_index: int = 0
    value: float
    is_time_series: bool = False


class TimeRange(BaseModel):
    """Time range information for a channel."""
    channel_id: UUID
    has_time: bool
    min_timestamp: Optional[float] = None
    max_timestamp: Optional[float] = None
    min_iso: Optional[str] = None
    max_iso: Optional[str] = None
    min_index: Optional[int] = None
    max_index: Optional[int] = None
    total_points: int = 0