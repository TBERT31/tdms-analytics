from uuid import UUID
from pydantic import BaseModel, Field


class Channel(BaseModel):
    """Channel entity."""
    id: UUID = Field(alias="channel_id")
    dataset_id: UUID
    group_name: str
    channel_name: str
    unit: str = ""
    has_time: bool
    n_rows: int

    class Config:
        populate_by_name = True


class ChannelCreate(BaseModel):
    """Channel creation model."""
    dataset_id: UUID
    group_name: str
    channel_name: str
    unit: str = ""
    has_time: bool
    n_rows: int
