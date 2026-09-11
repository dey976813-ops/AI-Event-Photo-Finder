from functools import lru_cache

from fastapi import HTTPException
from supabase import Client, create_client

from app.config import get_settings


def _configured(value: str | None, label: str) -> str:
    if not value:
        raise HTTPException(status_code=500, detail=f"Server configuration error: {label} is missing")
    return value


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(
        _configured(settings.supabase_url, "SUPABASE_URL"),
        _configured(settings.service_key, "SUPABASE_SECRET_KEY"),
    )


@lru_cache
def get_supabase_auth() -> Client:
    settings = get_settings()
    return create_client(
        _configured(settings.supabase_url, "SUPABASE_URL"),
        _configured(settings.public_key, "SUPABASE_PUBLISHABLE_KEY"),
    )
