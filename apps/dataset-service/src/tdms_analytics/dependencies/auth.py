"""Authentication dependencies for extracting user information with security."""
import logging
import os
from typing import Optional
from fastapi import Header, HTTPException

logger = logging.getLogger(__name__)

# Secret partagé entre l'API Gateway et le Backend
# IMPORTANT : À définir dans les variables d'environnement
GATEWAY_SECRET = os.getenv("GATEWAY_SECRET", "")

if not GATEWAY_SECRET:
    logger.warning(
        "GATEWAY_SECRET not set! Backend is vulnerable to header injection. "
        "Set GATEWAY_SECRET environment variable immediately."
    )


async def get_current_user_id(
    x_user_sub: Optional[str] = Header(None, alias="X-User-Sub"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_gateway_secret: Optional[str] = Header(None, alias="X-Gateway-Secret"),
) -> str:
    """
    Extract user_id (sub) from headers injected by API Gateway with security validation.
    
    SECURITY:
    - Validates shared secret to ensure request comes from trusted API Gateway
    - Prevents header injection attacks
    - The secret is NEVER exposed to clients
    
    Args:
        x_user_sub: Subject (user ID) from Keycloak JWT
        x_user_email: User email (optional, for logging)
        x_gateway_secret: Shared secret between Gateway and Backend
    
    Returns:
        str: The user_id (sub from Keycloak)
    
    Raises:
        HTTPException: 401 if authentication fails or request is unauthorized
    """
    # Verify request comes from trusted API Gateway
    if GATEWAY_SECRET and x_gateway_secret != GATEWAY_SECRET:
        logger.error(
            "Unauthorized access attempt - invalid or missing gateway secret. "
            f"Attempted user_sub: {x_user_sub or 'None'}"
        )
        raise HTTPException(
            status_code=401,
            detail="Unauthorized - requests must go through API Gateway"
        )
    
    if not x_user_sub:
        logger.error("Missing X-User-Sub header - authentication required")
        raise HTTPException(
            status_code=401,
            detail="Authentication required - missing user identification"
        )
    
    logger.info(f"Authenticated user: {x_user_sub} ({x_user_email or 'no email'})")
    return x_user_sub


async def get_optional_user_id(
    x_user_sub: Optional[str] = Header(None, alias="X-User-Sub"),
    x_gateway_secret: Optional[str] = Header(None, alias="X-Gateway-Secret"),
) -> Optional[str]:
    """
    Extract user_id optionally (for endpoints that may work without authentication).
    Still validates gateway secret if present.
    
    Returns:
        Optional[str]: The user_id if present and valid, None otherwise
    """
    # If secret is configured, validate it even for optional auth
    if GATEWAY_SECRET and x_gateway_secret and x_gateway_secret != GATEWAY_SECRET:
        logger.error("Invalid gateway secret in optional auth")
        raise HTTPException(
            status_code=401,
            detail="Unauthorized - invalid gateway credentials"
        )
    
    return x_user_sub if x_user_sub else None