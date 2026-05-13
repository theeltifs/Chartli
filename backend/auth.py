import secrets

from fastapi import Header, HTTPException, status

from backend.config import settings


async def require_pin(x_chartli_pin: str = Header(..., alias="X-Chartli-PIN")) -> None:
    # Constant-time comparison prevents timing attacks
    if not secrets.compare_digest(x_chartli_pin, settings.chartli_pin):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_pin", "message": "Invalid or missing PIN"},
        )
