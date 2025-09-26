import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import channels, data_windows, datasets, health, ingestion

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info("Starting TDMS Analytics Service")
    yield
    logger.info("Shutting down TDMS Analytics Service")


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

    # Include routers
    app.include_router(health.router, tags=["Health"])
    app.include_router(ingestion.router, tags=["Ingestion"])
    app.include_router(datasets.router, tags=["Datasets"])
    app.include_router(channels.router, tags=["Channels"])
    app.include_router(data_windows.router, tags=["Data Windows"])

    return app


# Application instance
app = create_app()