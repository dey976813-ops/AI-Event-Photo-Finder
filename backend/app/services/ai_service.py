import httpx
from fastapi import HTTPException

from app.config import get_settings


def get_embedding(content: bytes, filename: str, content_type: str | None) -> dict:
    url = get_settings().ai_service_url
    if not url:
        raise HTTPException(status_code=500, detail="Server configuration error: AI_SERVICE_URL is missing")
    try:
        response = httpx.post(f"{url.rstrip('/')}/embed", files={"file": (filename, content, content_type)}, timeout=30.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="AI face processing failed") from exc
