from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class Dataset(BaseModel):
    """Dataset entity."""
    id: UUID = Field(alias="dataset_id")
    filename: str
    created_at: datetime
    total_points: int

    class Config:
        populate_by_name = True


class DatasetCreate(BaseModel):
    """Dataset creation model."""
    filename: str
    total_points: int = 0