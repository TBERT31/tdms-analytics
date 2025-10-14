"""Custom exceptions for TDMS Analytics."""


class TDMSException(Exception):
    """Base exception for TDMS analytics."""
    pass


class TDMSAnalyticsError(TDMSException):
    """Base exception for TDMS Analytics."""
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


class ForbiddenAccessError(TDMSException):
    """User does not have access to the requested resource."""
    pass