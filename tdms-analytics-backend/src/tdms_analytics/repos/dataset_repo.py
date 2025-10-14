import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from ..clients.clickhouse import ClickHouseClient
from ..entities.dataset import Dataset, DatasetCreate
from ..exceptions.tdms_exceptions import DatasetNotFoundError, ForbiddenAccessError

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
            (dataset_id, user_id, filename, created_at, total_points) 
            VALUES (%(dataset_id)s, %(user_id)s, %(filename)s, %(created_at)s, %(total_points)s)
            """,
            {
                "dataset_id": dataset_id,
                "user_id": dataset_data.user_id,
                "filename": dataset_data.filename,
                "created_at": created_at,
                "total_points": dataset_data.total_points,
            }
        )
        
        return Dataset(
            dataset_id=dataset_id,
            user_id=dataset_data.user_id,
            filename=dataset_data.filename,
            created_at=created_at,
            total_points=dataset_data.total_points,
        )

    def get_all(self, user_id: Optional[str] = None) -> List[Dataset]:
        """Get all datasets, optionally filtered by user_id."""
        if user_id:
            query = f"""
                SELECT dataset_id, user_id, filename, created_at, total_points
                FROM {self.client.database}.datasets
                WHERE user_id = %(user_id)s
                ORDER BY created_at DESC
            """
            params = {"user_id": user_id}
        else:
            query = f"""
                SELECT dataset_id, user_id, filename, created_at, total_points
                FROM {self.client.database}.datasets
                ORDER BY created_at DESC
            """
            params = {}
        
        result = self.client._execute(query, params)
        
        return [
            Dataset(
                dataset_id=row[0],
                user_id=row[1],
                filename=row[2],
                created_at=row[3],
                total_points=row[4],
            )
            for row in result.result_rows
        ]

    def get_by_id(self, dataset_id: UUID, user_id: Optional[str] = None) -> Dataset:
        """Get dataset by ID, with optional user ownership verification."""
        result = self.client._execute(
            f"""
            SELECT dataset_id, user_id, filename, created_at, total_points
            FROM {self.client.database}.datasets
            WHERE dataset_id = %(dataset_id)s
            """,
            {"dataset_id": dataset_id}
        )
        
        if not result.result_rows:
            raise DatasetNotFoundError(f"Dataset {dataset_id} not found")
            
        row = result.result_rows[0]
        dataset = Dataset(
            dataset_id=row[0],
            user_id=row[1],
            filename=row[2],
            created_at=row[3],
            total_points=row[4],
        )
        
        # Verify ownership if user_id is provided
        if user_id and dataset.user_id != user_id:
            raise ForbiddenAccessError(
                f"User {user_id} does not have access to dataset {dataset_id}"
            )
        
        return dataset

    def delete(self, dataset_id: UUID, user_id: Optional[str] = None) -> None:
        """Delete a dataset and all related data, with optional user verification."""
        # Verify ownership before deletion if user_id provided
        if user_id:
            self.get_by_id(dataset_id, user_id)
        
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

    def check_ownership(self, dataset_id: UUID, user_id: str) -> bool:
        """Check if a user owns a specific dataset."""
        result = self.client._execute(
            f"""
            SELECT count() 
            FROM {self.client.database}.datasets 
            WHERE dataset_id = %(dataset_id)s AND user_id = %(user_id)s
            """,
            {"dataset_id": dataset_id, "user_id": user_id}
        )
        return bool(result.result_rows and result.result_rows[0][0] > 0)