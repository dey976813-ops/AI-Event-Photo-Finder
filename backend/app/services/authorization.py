from fastapi import HTTPException

from app.services.supabase_service import get_supabase
from app.utils.access_code import verify_access_code


def get_event(event_id: str, columns: str = "id, owner_id") -> dict | None:
    return get_supabase().table("events").select(columns).eq("id", event_id).maybe_single().execute().data


def can_access_event(user_id: str, event_id: str, access_code: str | None = None) -> bool:
    event = get_event(event_id, "id, owner_id, access_code_hash")
    if not event:
        return False
    if event["owner_id"] == user_id:
        return True
    return bool(access_code and verify_access_code(access_code.strip().upper(), event.get("access_code_hash")))


def require_event_access(user_id: str, event_id: str, access_code: str | None = None) -> dict:
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if not can_access_event(user_id, event_id, access_code):
        raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
    return event
