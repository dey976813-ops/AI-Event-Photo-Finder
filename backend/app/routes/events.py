# from fastapi import APIRouter, HTTPException
# from pydantic import BaseModel

# from app.dependencies import CurrentUser
# from app.services.authorization import can_access_event, get_event
from app.services.image_hash import hamming_distance
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
#         photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at, perceptual_hash, processing_status").eq("event_id", event_id).order("created_at", desc=True).execute().data or []
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
import io
import logging
import mimetypes
import zipfile

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.dependencies import CurrentUser
from app.services.authorization import can_access_event, get_event
from app.services.image_hash import hamming_distance
from app.services.supabase_service import get_supabase
from app.utils.access_code import generate_access_code, hash_access_code, verify_access_code

router = APIRouter(prefix="/api/events", tags=["events"])
logger = logging.getLogger(__name__)
BUCKET = "event-photos"
SIGNED_URL_EXPIRES_IN = 3600
EVENT_COLUMNS = "id, name, date, created_at, owner_id, access_code"


class EventBody(BaseModel):
    name: str | None = None
    date: object | None = None


class RedeemBody(BaseModel):
    access_code: str | None = None


class FavoriteBody(BaseModel):
    loved: bool | None = None


class FavoritePhotosBody(BaseModel):
    photo_ids: list[str]


def _user_id(user: object) -> str:
    return user.id


def _event_public(event: dict) -> dict:
    return {
        field: event.get(field)
        for field in ("id", "name", "date", "created_at", "owner_id", "access_code")
    }


def _filename(photo: dict) -> str:
    return (photo.get("storage_path") or "photo").rsplit("/", 1)[-1]


def _photo_for_event(event_id: str, photo_id: str) -> dict:
    response = get_supabase().table("photos").select("id, event_id, storage_path, created_at, perceptual_hash, processing_status").eq("id", photo_id).eq("event_id", event_id).execute()
    rows = response.data or []
    photo = rows[0] if isinstance(rows, list) and rows else rows
    if not photo:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo not found"})
    return photo


def _require_access(event_id: str, user: object, access_code: str | None = None) -> dict:
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if not can_access_event(_user_id(user), event_id, access_code):
        raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
    return event


@router.post("", status_code=201)
def create_event(body: EventBody, user: CurrentUser):
    if not isinstance(body.name, str) or not body.name.strip():
        raise HTTPException(status_code=400, detail={"success": False, "message": "Event name is required"})
    # Store the displayable code as event metadata and the hash used for
    # verification.  The dashboard is rehydrated from this backend record
    # after login, rather than relying on a transient browser-only code.
    access_code = generate_access_code()
    payload = {
        "name": body.name.strip(),
        "owner_id": _user_id(user),
        "access_code": access_code,
        "access_code_hash": hash_access_code(access_code),
    }
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
    return {"success": True, "event": event, "access_code": access_code}


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
    # The browser retains this verified code only in memory and sends it with
    # gallery actions. No permanent event_access record is created here.
    return {"success": True, "message": "Event access granted for this session", "event": public_event}


@router.post("/{event_id}/access-code")
def generate_event_access_code(event_id: str, user: CurrentUser):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != _user_id(user):
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can generate an access code"})
    code = generate_access_code()
    try:
        get_supabase().table("events").update({"access_code": code, "access_code_hash": hash_access_code(code)}).eq("id", event_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    return {"success": True, "event_id": event_id, "access_code": code}


@router.get("/{event_id}/photos")
def event_photos(event_id: str, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if not can_access_event(_user_id(user), event_id, access_code):
        raise HTTPException(status_code=403, detail={"success": False, "message": "You do not have access to this event"})
    try:
        favorites = get_supabase().table("photo_favorites").select("photo_id").eq("user_id", _user_id(user)).execute().data or []
        loved_ids = {row["photo_id"] for row in favorites}
        photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at, perceptual_hash, processing_status").eq("event_id", event_id).order("created_at", desc=True).execute().data or []
        duplicate_of = {}
        if event["owner_id"] == _user_id(user):
            hashed = [photo for photo in photos if photo.get("perceptual_hash")]
            for index, photo in enumerate(hashed):
                for earlier in hashed[index + 1:]:
                    try:
                        if hamming_distance(photo["perceptual_hash"], earlier["perceptual_hash"]) <= 8:
                            duplicate_of[photo["id"]] = earlier["id"]
                            break
                    except (TypeError, ValueError):
                        continue
        results = []
        for photo in photos:
            if not photo.get("storage_path"):
                continue
            try:
                signed = get_supabase().storage.from_(BUCKET).create_signed_url(photo["storage_path"], SIGNED_URL_EXPIRES_IN)
                url = signed.get("signedURL") or signed.get("signedUrl")
                if url:
                    results.append({**photo, "url": url, "loved": photo["id"] in loved_ids, "filename": _filename(photo), "duplicate_of": duplicate_of.get(photo["id"]) if event["owner_id"] == _user_id(user) else None})
            except Exception:
                continue
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"message": "Internal server error"}) from exc
    return {"success": True, "event_id": event_id, "photos": results, "count": len(results)}


@router.get("/{event_id}/photos/{photo_id}/download")
def download_photo(event_id: str, photo_id: str, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    photo = _photo_for_event(event_id, photo_id)
    try:
        content = get_supabase().storage.from_(BUCKET).download(photo["storage_path"])
    except Exception as exc:
        logger.exception("Photo download failed")
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not download this photo"}) from exc
    filename = _filename(photo)
    return Response(content=content, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{event_id}/download")
def download_event(event_id: str, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    photos = get_supabase().table("photos").select("id, storage_path").eq("event_id", event_id).order("created_at").execute().data or []
    archive = io.BytesIO()
    try:
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
            for photo in photos:
                if photo.get("storage_path"):
                    zipped.writestr(_filename(photo), get_supabase().storage.from_(BUCKET).download(photo["storage_path"]))
    except Exception as exc:
        logger.exception("Event archive failed")
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not prepare download"}) from exc
    return Response(content=archive.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="event-{event_id}-photos.zip"'})


@router.put("/{event_id}/photos/{photo_id}/favorite")
def set_favorite(event_id: str, photo_id: str, body: FavoriteBody, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    _photo_for_event(event_id, photo_id)
    loved = bool(body.loved)
    table = get_supabase().table("photo_favorites")
    try:
        if loved:
            # The unique constraint in the migration makes repeated taps idempotent.
            table.upsert({"user_id": _user_id(user), "photo_id": photo_id}, on_conflict="user_id,photo_id").execute()
        else:
            table.delete().eq("user_id", _user_id(user)).eq("photo_id", photo_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not save your reaction"}) from exc
    return {"success": True, "photo_id": photo_id, "loved": loved}


@router.post("/{event_id}/favorites/all")
def favorite_all(event_id: str, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    photos = get_supabase().table("photos").select("id").eq("event_id", event_id).execute().data or []
    rows = [{"user_id": _user_id(user), "photo_id": photo["id"]} for photo in photos]
    try:
        if rows:
            get_supabase().table("photo_favorites").upsert(rows, on_conflict="user_id,photo_id").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not save your reactions"}) from exc
    return {"success": True, "count": len(rows)}


@router.post("/{event_id}/favorites/selected")
def favorite_selected(event_id: str, body: FavoritePhotosBody, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    ids = list(dict.fromkeys(body.photo_ids))
    photos = get_supabase().table("photos").select("id").eq("event_id", event_id).in_("id", ids).execute().data or [] if ids else []
    if len(photos) != len(ids):
        raise HTTPException(status_code=400, detail={"success": False, "message": "One or more photos do not belong to this event"})
    if ids:
        get_supabase().table("photo_favorites").upsert([{"user_id": _user_id(user), "photo_id": photo_id} for photo_id in ids], on_conflict="user_id,photo_id").execute()
    return {"success": True, "count": len(ids)}


@router.get("/favorites/collections")
def loved_collections(user: CurrentUser):
    try:
        favorites = get_supabase().table("photo_favorites").select("photo_id").eq("user_id", _user_id(user)).execute().data or []
        ids = [row["photo_id"] for row in favorites]
        photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at, perceptual_hash, processing_status").in_("id", ids).execute().data if ids else []
        # A user can retain an old favorite row after their event access is
        # revoked. Do not disclose that event's title or photo count.
        allowed_event_ids = {
            photo["event_id"] for photo in photos
            if can_access_event(_user_id(user), photo["event_id"])
        }
        photos = [photo for photo in photos if photo["event_id"] in allowed_event_ids]
        event_ids = list(allowed_event_ids)
        events = get_supabase().table("events").select("id, name").in_("id", event_ids).execute().data if event_ids else []
        names = {event["id"]: event["name"] for event in events}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not retrieve loved photos"}) from exc
    groups = {}
    for photo in photos:
        groups.setdefault(photo["event_id"], []).append(photo)
    return {"success": True, "collections": [{"event_id": event_id, "name": names.get(event_id, "Event"), "count": len(group)} for event_id, group in groups.items()]}


@router.get("/favorites/{event_id}/download")
def download_loved(event_id: str, user: CurrentUser, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    _require_access(event_id, user, access_code)
    favorite_ids = [row["photo_id"] for row in get_supabase().table("photo_favorites").select("photo_id").eq("user_id", _user_id(user)).execute().data or []]
    photos = get_supabase().table("photos").select("id, storage_path").eq("event_id", event_id).in_("id", favorite_ids).execute().data if favorite_ids else []
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        for photo in photos:
            zipped.writestr(_filename(photo), get_supabase().storage.from_(BUCKET).download(photo["storage_path"]))
    return Response(content=archive.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="loved-{event_id}.zip"'})


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
        # My Events is deliberately an owner-only collection.  An access-code
        # grant authorizes gallery/matching actions but never converts a shared
        # event into an owned dashboard item.
        owned = supabase.table("events").select(EVENT_COLUMNS).eq("owner_id", _user_id(user)).order("date", desc=True).execute().data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not retrieve events"}) from exc
    return {"success": True, "events": owned}

@router.get("/{event_id}/insights")
def event_insights(event_id: str, user: CurrentUser):
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != user.id:
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can view insights"})
    supabase = get_supabase()
    photos = supabase.table("photos").select("id, processing_status, created_at").eq("event_id", event_id).execute().data or []
    activity = supabase.table("event_activity").select("kind, created_at").eq("event_id", event_id).order("created_at", desc=True).limit(100).execute().data or []
    statuses = {"ready": 0, "pending": 0, "processing": 0, "failed": 0}
    for photo in photos:
        status = photo.get("processing_status")
        if status in statuses:
            statuses[status] += 1
    activity_counts = {"match_searches": 0, "downloads": 0}
    for row in activity:
        if row.get("kind") == "match_search": activity_counts["match_searches"] += 1
        if row.get("kind") == "download": activity_counts["downloads"] += 1
    photo_ids = [photo["id"] for photo in photos]
    # Insights are owner-only, but favorites remain user-scoped. Count only
    # favorites attached to this event and collections owned by this owner;
    # neither query discloses another user's favorites or collections.
    favorite_rows = supabase.table("photo_favorites").select("photo_id").in_("photo_id", photo_ids).execute().data or [] if photo_ids else []
    collection_rows = supabase.table("loved_collections").select("id").eq("user_id", user.id).execute().data or []
    return {"success": True, "event_id": event_id, "metrics": {"total_photos": len(photos), **statuses, **activity_counts, "loved_photos": len(favorite_rows), "loved_collections": len(collection_rows)}, "activity": activity}
