import logging
from datetime import datetime
from typing import List
from uuid import UUID

from ..clients.clickhouse import ClickHouseClient
from ..entities.dataset import Dataset, DatasetCreate
from ..exceptions.tdms_exceptions import DatasetNotFoundError

logger = logging.getLogger(__name__)


class DatasetRepository:
    """Repository for dataset operations."""

    def __init__(self, clickhouse_client: ClickHouseClient):
        self.client = clickhouse_client

    def create(self, dataset_id: UUID, dataset_data: DatasetCreate) -> Dataset:
        """Create a new dataset."""
        created_at = datetime.utcnow()
        
        self.client._execute(
            f"""
            INSERT INTO {self.client.database}.datasets 
            (dataset_id, filename, created_at, total_points) 
            VALUES (%(dataset_id)s, %(filename)s, %(created_at)s, %(total_points)s)
            """,
            {
                "dataset_id": dataset_id,
                "filename": dataset_data.filename,
                "created_at": created_at,
                "total_points": dataset_data.total_points,
            }
        )
        
        return Dataset(
            dataset_id=dataset_id,
            filename=dataset_data.filename,
            created_at=created_at,
            total_points=dataset_data.total_points,
        )

    def get_all(self) -> List[Dataset]:
        """Get all datasets."""
        result = self.client._execute(
            f"""
            SELECT dataset_id, filename, created_at, total_points
            FROM {self.client.database}.datasets
            ORDER BY created_at DESC
            """
        )
        
        return [
            Dataset(
                dataset_id=row[0],
                filename=row[1],
                created_at=row[2],
                total_points=row[3],
            )
            for row in result.result_rows
        ]

    def get_by_id(self, dataset_id: UUID) -> Dataset:
        """Get dataset by ID."""
        result = self.client._execute(
            f"""
            SELECT dataset_id, filename, created_at, total_points
            FROM {self.client.database}.datasets
            WHERE dataset_id = %(dataset_id)s
            """,
            {"dataset_id": dataset_id}
        )
        
        if not result.result_rows:
            raise DatasetNotFoundError(f"Dataset {dataset_id} not found")
            
        row = result.result_rows[0]
        return Dataset(
            dataset_id=row[0],
            filename=row[1],
            created_at=row[2],
            total_points=row[3],
        )

    def delete(self, dataset_id: UUID) -> None:
        """Delete a dataset and all related data."""
        # Delete sensor data partition
        self.client._execute(
            f"ALTER TABLE {self.client.database}.sensor_data DROP PARTITION %(dataset_id)s",
            {"dataset_id": dataset_id}
        )
        
        # Delete channels
        self.client._execute(
            f"ALTER TABLE {self.client.database}.channels DELETE WHERE dataset_id = %(dataset_id)s",
            {"dataset_id": dataset_id}
        )
        
        # Delete dataset
        self.client._execute(
            f"ALTER TABLE {self.client.database}.datasets DELETE WHERE dataset_id = %(dataset_id)s",
            {"dataset_id": dataset_id}
        )