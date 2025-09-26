import logging
from typing import List
from uuid import UUID

from ..clients.clickhouse import ClickHouseClient
from ..entities.channel import Channel, ChannelCreate
from ..exceptions.tdms_exceptions import ChannelNotFoundError

logger = logging.getLogger(__name__)


class ChannelRepository:
    """Repository for channel operations."""

    def __init__(self, clickhouse_client: ClickHouseClient):
        self.client = clickhouse_client

    def create(self, channel_id: UUID, channel_data: ChannelCreate) -> Channel:
        """Create a new channel."""
        self.client._execute(
            f"""
            INSERT INTO {self.client.database}.channels 
            (channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows) 
            VALUES (%(channel_id)s, %(dataset_id)s, %(group_name)s, %(channel_name)s, 
                   %(unit)s, %(has_time)s, %(n_rows)s)
            """,
            {
                "channel_id": channel_id,
                "dataset_id": channel_data.dataset_id,
                "group_name": channel_data.group_name,
                "channel_name": channel_data.channel_name,
                "unit": channel_data.unit,
                "has_time": 1 if channel_data.has_time else 0,
                "n_rows": channel_data.n_rows,
            }
        )
        
        return Channel(
            channel_id=channel_id,
            dataset_id=channel_data.dataset_id,
            group_name=channel_data.group_name,
            channel_name=channel_data.channel_name,
            unit=channel_data.unit,
            has_time=channel_data.has_time,
            n_rows=channel_data.n_rows,
        )

    def get_by_dataset_id(self, dataset_id: UUID) -> List[Channel]:
        """Get all channels for a dataset."""
        result = self.client._execute(
            f"""
            SELECT channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows
            FROM {self.client.database}.channels
            WHERE dataset_id = %(dataset_id)s
            ORDER BY channel_id
            """,
            {"dataset_id": dataset_id}
        )
        
        return [
            Channel(
                channel_id=row[0],
                dataset_id=row[1],
                group_name=row[2],
                channel_name=row[3],
                unit=row[4],
                has_time=bool(row[5]),
                n_rows=row[6],
            )
            for row in result.result_rows
        ]

    def get_by_id(self, channel_id: UUID) -> Channel:
        """Get channel by ID."""
        result = self.client._execute(
            f"""
            SELECT channel_id, dataset_id, group_name, channel_name, unit, has_time, n_rows
            FROM {self.client.database}.channels
            WHERE channel_id = %(channel_id)s
            """,
            {"channel_id": channel_id}
        )
        
        if not result.result_rows:
            raise ChannelNotFoundError(f"Channel {channel_id} not found")
            
        row = result.result_rows[0]
        return Channel(
            channel_id=row[0],
            dataset_id=row[1],
            group_name=row[2],
            channel_name=row[3],
            unit=row[4],
            has_time=bool(row[5]),
            n_rows=row[6],
        )

    def exists(self, channel_id: UUID) -> bool:
        """Check if channel exists."""
        result = self.client._execute(
            f"SELECT count() FROM {self.client.database}.channels WHERE channel_id = %(channel_id)s",
            {"channel_id": channel_id}
        )
        return bool(result.result_rows and result.result_rows[0][0] > 0)