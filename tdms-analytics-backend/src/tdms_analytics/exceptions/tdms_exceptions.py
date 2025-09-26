class TDMSException(Exception):
    """Base exception for TDMS analytics."""
    pass


class ClickHouseConnectionError(TDMSException):
    """Raised when ClickHouse connection fails."""
    pass


class DatasetNotFoundError(TDMSException):
    """Raised when dataset is not found."""
    pass


class ChannelNotFoundError(TDMSException):
    """Raised when channel is not found."""
    pass


class InvalidDataError(TDMSException):
    """Raised when data validation fails."""
    pass


class IngestionError(TDMSException):
    """Raised when data ingestion fails."""
    pass