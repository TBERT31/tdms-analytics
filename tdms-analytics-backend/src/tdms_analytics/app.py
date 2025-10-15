import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from .app_settings import app_settings

from .routes import channels, data_windows, datasets, health, ingestion, monitoring

from .clients.clickhouse import ClickHouseClient
from .tasks.cleanup_orphans import setup_cleanup_scheduler  

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("Starting TDMS Analytics Service")

    try:
        logger.info("Initializing ClickHouse database...")
        clickhouse_client = ClickHouseClient()
        logger.info("ClickHouse database initialized successfully")
        app.state.clickhouse_client = clickhouse_client
        
        # Setup automatic cleanup scheduler
        scheduler = setup_cleanup_scheduler(clickhouse_client)
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Cleanup scheduler started (runs daily at 3:00 AM)")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise

    yield
    
    # Shutdown
    logger.info("Shutting down TDMS Analytics Service")
    if hasattr(app.state, 'scheduler'):
        app.state.scheduler.shutdown()
        logger.info("Cleanup scheduler stopped")
    if hasattr(app.state, 'clickhouse_client'):
        app.state.clickhouse_client.close()
        logger.info("ClickHouse connection closed")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="TDMS → ClickHouse Analytics API",
        version="0.1.0",
        description="Analytics service for TDMS sensor data using ClickHouse",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # GZip middleware
    if app_settings.gzip_enabled:
        app.add_middleware(
            GZipMiddleware,
            minimum_size=app_settings.gzip_min_size,
            compresslevel=app_settings.gzip_level,
        )

    # Include routers
    app.include_router(health.router, tags=["Health"])
    app.include_router(ingestion.router, tags=["Ingestion"])
    app.include_router(datasets.router, tags=["Datasets"])
    app.include_router(channels.router, tags=["Channels"])
    app.include_router(data_windows.router, tags=["Data Windows"])
    app.include_router(monitoring.router, tags=["Monitoring"]) 

    return app


# Application instance
app = create_app()