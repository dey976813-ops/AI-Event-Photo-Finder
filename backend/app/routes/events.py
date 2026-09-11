# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel

# from app.dependencies import CurrentUser
# from app.services.authorization import can_access_event, get_event
# from app.services.supabase_service import get_supabase
# from app.utils.access_code import generate_access_code, hash_access_code, verify_access_code

# router = APIRouter(prefix="/api/events", tags=["events"])
# BUCKET = "event-photos"
# SIGNED_URL_EXPIRES_IN = 3600
# EVENT_COLUMNS = "id, name, date, created_at, owner_id"


# class EventBody(BaseModel):
#     name: str | None = None
#     date: object | None = None


# class RedeemBody(BaseModel):
#     access_code: str | None = None


# def _user_id(user: object) -> str:
#     return user.id


# def _event_public(event: dict) -> dict:
#     return {field: event.get(field) for field in ("id", "name", "date", "created_at", "owner_id")}


# @router.post("", status_code=201)
# def create_event(body: EventBody, user: CurrentUser):
#     if not isinstance(body.name, str) or not body.name.strip():
#         raise HTTPException(status_code=400, detail={"success": False, "message": "Event name is required"})
#     payload = {"name": body.name.strip(), "owner_id": _user_id(user)}
#     if body.date not in (None, ""):
#         payload["date"] = body.date
#     try:
#         # supabase-py's insert().select() returns a query builder rather than
#         # the filter builder that exposes .single().  Execute the insert and
#         # unwrap its one-row representation explicitly.
#         response = get_supabase().table("events").insert(payload).select(EVENT_COLUMNS).execute()
#         rows = response.data or []
#         event = rows[0] if isinstance(rows, list) else rows
#         if not event:
#             raise RuntimeError("Supabase did not return the created event")
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"success": False, "message": "Could not create event"}) from exc
#     return {"success": True, "event": event}


# @router.post("/access-code/redeem")
# def redeem_access_code(body: RedeemBody, user: CurrentUser):
#     if not isinstance(body.access_code, str) or not body.access_code:
#         raise HTTPException(status_code=400, detail={"success": False, "message": "Access code is required"})
#     try:
#         events = get_supabase().table("events").select(f"{EVENT_COLUMNS}, access_code_hash").not_.is_("access_code_hash", "null").execute().data or []
#         event = next((item for item in events if verify_access_code(body.access_code.strip().upper(), item.get("access_code_hash"))), None)
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
#     if not event:
#         raise HTTPException(status_code=400, detail={"success": False, "message": "Invalid access code"})
#     user_id = _user_id(user)
#     public_event = _event_public(event)
#     if event["owner_id"] == user_id:
#         return {"success": True, "message": "You already have access to this event", "event": public_event}
#     try:
#         existing = get_supabase().table("event_access").select("id").eq("event_id", event["id"]).eq("user_id", user_id).maybe_single().execute().data
#         if existing:
#             return {"success": True, "message": "You already have access to this event", "event": public_event}
#         get_supabase().table("event_access").insert({"event_id": event["id"], "user_id": user_id}).execute()
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
#     return {"success": True, "message": "Event access granted", "event": public_event}


# @router.post("/{event_id}/access-code")
# def generate_event_access_code(event_id: str, user: CurrentUser):
#     event = get_event(event_id)
#     if not event:
#         raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
#     if event["owner_id"] != _user_id(user):
#         raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can generate an access code"})
#     code = generate_access_code()
#     try:
#         get_supabase().table("events").update({"access_code_hash": hash_access_code(code)}).eq("id", event_id).execute()
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
#     return {"success": True, "event_id": event_id, "access_code": code}


# @router.get("/{event_id}/photos")
# def event_photos(event_id: str, user: CurrentUser):
#     event = get_event(event_id)
#     if not event:
#         raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
#     if not can_access_event(_user_id(user), event_id):
#         raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
#     try:
#         photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at").eq("event_id", event_id).order("created_at", desc=True).execute().data or []
#         results = []
#         for photo in photos:
#             if not photo.get("storage_path"):
#                 continue
#             try:
#                 signed = get_supabase().storage.from_(BUCKET).create_signed_url(photo["storage_path"], SIGNED_URL_EXPIRES_IN)
#                 url = signed.get("signedURL") or signed.get("signedUrl")
#                 if url:
#                     results.append({**photo, "url": url})
#             except Exception:
#                 continue
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
#     return {"success": True, "event_id": event_id, "photos": results, "count": len(results)}


# @router.delete("/{event_id}")
# def delete_event(event_id: str, user: CurrentUser):
#     event = get_event(event_id)
#     if not event:
#         raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
#     if event["owner_id"] != _user_id(user):
#         raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can delete this event"})
#     supabase = get_supabase()
#     try:
#         photos = supabase.table("photos").select("storage_path").eq("event_id", event_id).execute().data or []
#         paths = list({photo["storage_path"] for photo in photos if isinstance(photo.get("storage_path"), str) and photo["storage_path"]})
#         if paths:
#             supabase.storage.from_(BUCKET).remove(paths)
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"success": False, "message": "Could not remove event media"}) from exc
#     try:
#         supabase.table("event_access").delete().eq("event_id", event_id).execute()
#         deleted = supabase.table("events").delete().eq("id", event_id).eq("owner_id", _user_id(user)).select("id").maybe_single().execute().data
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
#     if not deleted:
#         raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
#     return {"success": True, "message": "Event deleted successfully", "event_id": event_id}


# @router.get("")
# def list_events(user: CurrentUser):
#     supabase = get_supabase()
#     try:
#         owned = supabase.table("events").select(EVENT_COLUMNS).eq("owner_id", _user_id(user)).order("date", desc=True).execute().data or []
#         access = supabase.table("event_access").select("event_id").eq("user_id", _user_id(user)).execute().data or []
#         ids = [item["event_id"] for item in access]
#         shared = supabase.table("events").select(EVENT_COLUMNS).in_("id", ids).order("date", desc=True).execute().data if ids else []
#     except Exception as exc:
#         raise HTTPException(status_code=500, detail={"success": False, "message": "Could not retrieve events"}) from exc
#     events = {event["id"]: event for event in owned}
#     events.update({event["id"]: event for event in shared or []})
#     return {"success": True, "events": list(events.values())}
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import CurrentUser
from app.services.authorization import can_access_event, get_event
from app.services.supabase_service import get_supabase
from app.utils.access_code import generate_access_code, hash_access_code, verify_access_code

router = APIRouter(prefix="/api/events", tags=["events"])
logger = logging.getLogger(__name__)
BUCKET = "event-photos"
SIGNED_URL_EXPIRES_IN = 3600
EVENT_COLUMNS = "id, name, date, created_at, owner_id"


class EventBody(BaseModel):
    name: str | None = None
    date: object | None = None


class RedeemBody(BaseModel):
    access_code: str | None = None


def _user_id(user: object) -> str:
    return user.id


def _event_public(event: dict) -> dict:
    return {field: event.get(field) for field in ("id", "name", "date", "created_at", "owner_id")}


@router.post("", status_code=201)
def create_event(body: EventBody, user: CurrentUser):
    if not isinstance(body.name, str) or not body.name.strip():
        raise HTTPException(status_code=400, detail={"success": False, "message": "Event name is required"})
    payload = {"name": body.name.strip(), "owner_id": _user_id(user)}
    if body.date not in (None, ""):
        payload["date"] = body.date
    try:
        # supabase-py's insert().select() returns a query builder rather than
        # the filter builder that exposes .single().  Execute the insert and
        # unwrap its one-row representation explicitly.
        response = get_supabase().table("events").insert(payload).select(EVENT_COLUMNS).execute()
        rows = response.data or []
        event = rows[0] if isinstance(rows, list) else rows
        if not event:
            raise RuntimeError("Supabase did not return the created event")
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not create event"}) from exc
    return {"success": True, "event": event}


@router.post("/access-code/redeem")
def redeem_access_code(body: RedeemBody, user: CurrentUser):
    if not isinstance(body.access_code, str) or not body.access_code:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Access code is required"})
    try:
        events = get_supabase().table("events").select(f"{EVENT_COLUMNS}, access_code_hash").not_.is_("access_code_hash", "null").execute().data or []
        event = next((item for item in events if verify_access_code(body.access_code.strip().upper(), item.get("access_code_hash"))), None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    if not event:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Invalid access code"})
    user_id = _user_id(user)
    public_event = _event_public(event)
    if event["owner_id"] == user_id:
        return {"success": True, "message": "You already have access to this event", "event": public_event}
    try:
        response = get_supabase().table("event_access").select("id").eq("event_id", event["id"]).eq("user_id", user_id).execute()
        rows = response.data or []
        existing = rows[0] if isinstance(rows, list) and rows else rows
        if existing:
            return {"success": True, "message": "You already have access to this event", "event": public_event}
        get_supabase().table("event_access").insert({"event_id": event["id"], "user_id": user_id}).execute()
    except Exception as exc:
        logger.exception("Event access-code redemption failed")
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    return {"success": True, "message": "Event access granted", "event": public_event}


@router.post("/{event_id}/access-code")
def generate_event_access_code(event_id: str, user: CurrentUser):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != _user_id(user):
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can generate an access code"})
    code = generate_access_code()
    try:
        get_supabase().table("events").update({"access_code_hash": hash_access_code(code)}).eq("id", event_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    return {"success": True, "event_id": event_id, "access_code": code}


@router.get("/{event_id}/photos")
def event_photos(event_id: str, user: CurrentUser):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if not can_access_event(_user_id(user), event_id):
        raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
    try:
        photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at").eq("event_id", event_id).order("created_at", desc=True).execute().data or []
        results = []
        for photo in photos:
            if not photo.get("storage_path"):
                continue
            try:
                signed = get_supabase().storage.from_(BUCKET).create_signed_url(photo["storage_path"], SIGNED_URL_EXPIRES_IN)
                url = signed.get("signedURL") or signed.get("signedUrl")
                if url:
                    results.append({**photo, "url": url})
            except Exception:
                continue
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    return {"success": True, "event_id": event_id, "photos": results, "count": len(results)}


@router.delete("/{event_id}")
def delete_event(event_id: str, user: CurrentUser):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != _user_id(user):
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can delete this event"})
    supabase = get_supabase()
    try:
        photos = supabase.table("photos").select("storage_path").eq("event_id", event_id).execute().data or []
        paths = list({photo["storage_path"] for photo in photos if isinstance(photo.get("storage_path"), str) and photo["storage_path"]})
        if paths:
            supabase.storage.from_(BUCKET).remove(paths)
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not remove event media"}) from exc
    try:
        supabase.table("event_access").delete().eq("event_id", event_id).execute()
        response = supabase.table("events").delete().eq("id", event_id).eq("owner_id", _user_id(user)).select("id").execute()
        rows = response.data or []
        deleted = rows[0] if isinstance(rows, list) else rows
    except Exception as exc:
        logger.exception("Event deletion failed")
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    return {"success": True, "message": "Event deleted successfully", "event_id": event_id}


@router.get("")
def list_events(user: CurrentUser):
    supabase = get_supabase()
    try:
        owned = supabase.table("events").select(EVENT_COLUMNS).eq("owner_id", _user_id(user)).order("date", desc=True).execute().data or []
        access = supabase.table("event_access").select("event_id").eq("user_id", _user_id(user)).execute().data or []
        ids = [item["event_id"] for item in access]
        shared = supabase.table("events").select(EVENT_COLUMNS).in_("id", ids).order("date", desc=True).execute().data if ids else []
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not retrieve events"}) from exc
    events = {event["id"]: event for event in owned}
    events.update({event["id"]: event for event in shared or []})
    return {"success": True, "events": list(events.values())}
