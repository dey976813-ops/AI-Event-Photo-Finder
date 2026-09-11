from fastapi import HTTPException

from app.services.supabase_service import get_supabase


def get_event(event_id: str, columns: str = "id, owner_id") -> dict | None:
    return get_supabase().table("events").select(columns).eq("id", event_id).maybe_single().execute().data


def can_access_event(user_id: str, event_id: str) -> bool:
    event = get_event(event_id)
    if not event:
        return False
    if event["owner_id"] == user_id:
        return True
    access = get_supabase().table("event_access").select("id").eq("event_id", event_id).eq("user_id", user_id).maybe_single().execute().data
    return bool(access)


def require_event_access(user_id: str, event_id: str) -> dict:
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if not can_access_event(user_id, event_id):
        raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
    return event
