from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # ClickHouse Configuration
    clickhouse_host: str = Field(default="localhost", description="ClickHouse host")
    clickhouse_port: int = Field(default=8123, description="ClickHouse HTTP port") 
    clickhouse_database: str = Field(default="tdms_data", description="ClickHouse database")
    clickhouse_user: str = Field(default="default", description="ClickHouse user")
    clickhouse_password: str = Field(default="pass", description="ClickHouse password")

    # Redis Configuration (pour usage futur)
    redis_host: str = Field(default="localhost", description="Redis host")
    redis_port: int = Field(default=6379, description="Redis port")
    redis_password: str = Field(default="", description="Redis password")

    # API Constraints
    points_min: int = Field(default=10, description="Minimum points for downsampling")
    points_max: int = Field(default=20000, description="Maximum points for downsampling")
    limit_min: int = Field(default=10000, description="Minimum limit for data fetch")
    limit_max: int = Field(default=200000, description="Maximum limit for data fetch")

    # Default Values
    default_points: int = Field(default=2000, description="Default points for downsampling")
    default_limit: int = Field(default=50000, description="Default limit for data fetch")

    # Performance Settings
    chunk_size: int = Field(default=1000000, description="Chunk size for bulk inserts")
    max_insert_block_size: int = Field(default=10000000, description="ClickHouse insert block size")
    max_threads: int = Field(default=8, description="ClickHouse max threads")
    parallel_workers: int = Field(default=4, description="Number of parallel workers for channel processing")

    # Compression Settings
    gzip_enabled: bool = True
    gzip_min_size: int = 2048      # 2 KiB
    gzip_level: int = 6 

    # Application Settings
    log_level: str = Field(default="INFO", description="Logging level")
    debug: bool = Field(default=False, description="Debug mode")
    
    # CORS Settings
    allowed_origins: str = Field(default="*", description="Allowed CORS origins")

    def get_api_constraints(self) -> dict:
        """Return API constraints for frontend."""
        return {
            "points": {
                "min": self.points_min,
                "max": self.points_max,
                "default": self.default_points
            },
            "limit": {
                "min": self.limit_min,
                "max": self.limit_max,
                "default": self.default_limit
            }
        }

    def get_clickhouse_url(self) -> str:
        """Get ClickHouse connection URL."""
        return f"clickhouse://{self.clickhouse_user}:{self.clickhouse_password}@{self.clickhouse_host}:{self.clickhouse_port}/{self.clickhouse_database}"

    def get_redis_url(self) -> str:
        """Get Redis connection URL."""
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}"
        return f"redis://{self.redis_host}:{self.redis_port}"


# Instance globale de configuration
app_settings = AppSettings()