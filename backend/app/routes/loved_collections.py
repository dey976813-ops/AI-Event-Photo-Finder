import io
import logging
import mimetypes
import zipfile
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config import get_settings
from app.dependencies import CurrentUser
from app.services.authorization import can_access_event, get_event
from app.services.supabase_service import get_supabase
from app.utils.access_code import verify_access_code

router = APIRouter(prefix="/api/loved-collections", tags=["loved collections"])
BUCKET = "event-photos"
logger = logging.getLogger(__name__)


class CollectionBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    photo_ids: list[str] = Field(min_length=1, max_length=500)
    # The browser keeps redeemed event codes only in memory.  A collection may
    # contain photos from more than one shared event, so the code is keyed by
    # event id and is verified below instead of being persisted.
    event_access_codes: dict[str, str] = Field(default_factory=dict)


class PhotoIdsBody(BaseModel):
    photo_ids: list[str] = Field(min_length=1, max_length=500)
    event_access_codes: dict[str, str] = Field(default_factory=dict)


def _one(response):
    rows = response.data or []
    return rows[0] if isinstance(rows, list) and rows else rows


def _owned(collection_id: str, user_id: str) -> dict:
    collection = _one(get_supabase().table("loved_collections").select("id, user_id, name, created_at").eq("id", collection_id).eq("user_id", user_id).execute())
    if not collection:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Loved collection not found"})
    return collection


def _authorized_photos(photo_ids: list[str], user_id: str, event_access_codes: dict[str, str] | None = None) -> list[dict]:
    unique_photo_ids = list(set(photo_ids))
    photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at").in_("id", unique_photo_ids).execute().data or []
    event_access_codes = event_access_codes or {}
    favorite_rows = get_supabase().table("photo_favorites").select("photo_id").eq("user_id", user_id).in_("photo_id", unique_photo_ids).execute().data or []
    favorited_photo_ids = {str(row["photo_id"]) for row in favorite_rows}
    photos_by_id = {str(photo["id"]): photo for photo in photos}
    diagnostics = []
    failures = []

    for photo_id in unique_photo_ids:
        photo = photos_by_id.get(str(photo_id))
        diagnostic = {
            "photo_id": str(photo_id),
            "found": bool(photo),
            "event_id": str(photo["event_id"]) if photo else None,
            "event_access_code_supplied": False,
            "event_access_code_valid": False,
            "favorited_by_current_user": str(photo_id) in favorited_photo_ids,
            "event_access_allowed": False,
            "reason": None,
        }
        if not photo:
            diagnostic["reason"] = "photo_not_found"
            failures.append(diagnostic)
            diagnostics.append(diagnostic)
            continue

        event_id = str(photo["event_id"])
        supplied_code = event_access_codes.get(event_id)
        diagnostic["event_access_code_supplied"] = bool(supplied_code)
        event = get_event(event_id, "id, owner_id, access_code_hash")
        diagnostic["event_access_code_valid"] = bool(
            supplied_code and event and verify_access_code(supplied_code, event.get("access_code_hash"))
        )
        diagnostic["event_access_allowed"] = can_access_event(user_id, event_id, supplied_code)

        # Keep the existing authorization decision intact: a photo is allowed
        # only when it is already favorited by this user or normal event access
        # (owner/shared access code) verifies.
        if not diagnostic["favorited_by_current_user"] and not diagnostic["event_access_allowed"]:
            diagnostic["reason"] = (
                "event_not_found" if not event
                else "event_access_code_invalid" if supplied_code
                else "not_favorited_and_no_valid_event_access"
            )
            failures.append(diagnostic)
        diagnostics.append(diagnostic)

    if failures:
        if get_settings().development_diagnostics:
            # Do not log access-code values, tokens, secrets, storage paths,
            # signed URLs, or any other credential material.
            logger.warning(
                "Loved collection photo validation failed for user_id=%s selected_photo_ids=%s details=%s",
                user_id,
                unique_photo_ids,
                diagnostics,
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "success": False,
                    "error": "collection_photo_validation_failed",
                    "details": failures,
                },
            )
        raise HTTPException(status_code=403, detail={"success": False, "message": "One or more photos are unavailable"})
    return photos


def _detail(collection: dict, user_id: str) -> dict:
    memberships = get_supabase().table("loved_collection_photos").select("photo_id, created_at").eq("collection_id", collection["id"]).order("created_at").execute().data or []
    ids = [row["photo_id"] for row in memberships]
    photos = get_supabase().table("photos").select("id, event_id, storage_path, created_at").in_("id", ids).execute().data if ids else []
    result = []
    # Collection ownership and the membership rows limit access to these exact
    # photos.  Do not recheck event access here: a redeemed shared-event code
    # is intentionally memory-only and may no longer be present when the user
    # later opens their own collection.  This never grants access to the rest
    # of the shared event.
    for photo in photos:
        try:
            signed = get_supabase().storage.from_(BUCKET).create_signed_url(photo["storage_path"], 3600)
            result.append({**photo, "filename": photo["storage_path"].rsplit("/", 1)[-1], "url": signed.get("signedURL") or signed.get("signedUrl"), "loved": True})
        except Exception:
            continue
    return {**collection, "photos": result, "count": len(result)}


@router.get("")
def list_collections(user: CurrentUser):
    rows = get_supabase().table("loved_collections").select("id, user_id, name, created_at").eq("user_id", user.id).order("created_at", desc=True).execute().data or []
    return {"success": True, "collections": [_detail(row, user.id) for row in rows]}


# Keep the public recipient route ahead of the dynamic /{collection_id}
# routes below. Starlette resolves routes in registration order, so placing it
# after /{collection_id} would make the literal "shared" look like a private
# collection id and turn every valid share link into a 404.
@router.get("/shared/{token}")
def shared_collection(token: str):
    share = _active_share(token)
    collection = _one(get_supabase().table("loved_collections").select("id, name, created_at").eq("id", share["collection_id"]).execute())
    if not collection:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Shared collection is unavailable"})
    memberships = get_supabase().table("loved_collection_photos").select("photo_id").eq("collection_id", collection["id"]).execute().data or []
    ids = [row["photo_id"] for row in memberships]
    photos = get_supabase().table("photos").select("id, storage_path").in_("id", ids).execute().data if ids else []
    result = []
    for photo in photos:
        try:
            signed = get_supabase().storage.from_(BUCKET).create_signed_url(photo["storage_path"], 3600)
            result.append({"id": photo["id"], "filename": photo["storage_path"].rsplit("/", 1)[-1], "url": signed.get("signedURL") or signed.get("signedUrl")})
        except Exception:
            continue
    return {"success": True, "collection": {"name": collection["name"], "photos": result, "count": len(result)}}


@router.get("/shared/{token}/photos/{photo_id}/download")
def download_shared_collection_photo(token: str, photo_id: str):
    """Download only a member of the token's active collection; no event access is granted."""
    share = _active_share(token)
    membership = _one(get_supabase().table("loved_collection_photos").select("photo_id").eq("collection_id", share["collection_id"]).eq("photo_id", photo_id).execute())
    if not membership:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo is not in this shared collection"})
    photo = _one(get_supabase().table("photos").select("storage_path").eq("id", photo_id).execute())
    if not photo:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo not found"})
    filename = photo["storage_path"].rsplit("/", 1)[-1]
    return Response(get_supabase().storage.from_(BUCKET).download(photo["storage_path"]), media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/shared/{token}/download")
def download_shared_collection(token: str):
    """Return a ZIP made exclusively from the active token's membership rows."""
    share = _active_share(token)
    collection = _one(get_supabase().table("loved_collections").select("id, name").eq("id", share["collection_id"]).execute())
    if not collection:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Shared collection is unavailable"})
    memberships = get_supabase().table("loved_collection_photos").select("photo_id").eq("collection_id", collection["id"]).execute().data or []
    ids = [row["photo_id"] for row in memberships]
    photos = get_supabase().table("photos").select("id, storage_path").in_("id", ids).execute().data if ids else []
    archive = io.BytesIO()
    try:
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
            for photo in photos:
                if photo.get("storage_path"):
                    zipped.writestr(photo["storage_path"].rsplit("/", 1)[-1], get_supabase().storage.from_(BUCKET).download(photo["storage_path"]))
    except Exception as exc:
        logger.exception("Shared collection archive failed")
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not prepare shared collection download"}) from exc
    return Response(archive.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{collection["name"]}.zip"'})


@router.post("", status_code=201)
def create_collection(body: CollectionBody, user: CurrentUser):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Collection name is required"})
    _authorized_photos(body.photo_ids, user.id, body.event_access_codes)
    collection = _one(get_supabase().table("loved_collections").insert({"user_id": user.id, "name": name}).select("id, user_id, name, created_at").execute())
    get_supabase().table("loved_collection_photos").upsert([{"collection_id": collection["id"], "photo_id": photo_id} for photo_id in set(body.photo_ids)], on_conflict="collection_id,photo_id").execute()
    return {"success": True, "collection": _detail(collection, user.id)}


@router.get("/{collection_id}")
def get_collection(collection_id: str, user: CurrentUser):
    return {"success": True, "collection": _detail(_owned(collection_id, user.id), user.id)}


@router.post("/{collection_id}/photos")
def add_photos(collection_id: str, body: PhotoIdsBody, user: CurrentUser):
    _owned(collection_id, user.id)
    _authorized_photos(body.photo_ids, user.id, body.event_access_codes)
    get_supabase().table("loved_collection_photos").upsert([{"collection_id": collection_id, "photo_id": photo_id} for photo_id in set(body.photo_ids)], on_conflict="collection_id,photo_id").execute()
    return {"success": True, "collection": _detail(_owned(collection_id, user.id), user.id)}


@router.delete("/{collection_id}/photos/{photo_id}")
def remove_photo(collection_id: str, photo_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    get_supabase().table("loved_collection_photos").delete().eq("collection_id", collection_id).eq("photo_id", photo_id).execute()
    return {"success": True, "collection_id": collection_id, "photo_id": photo_id}


@router.get("/{collection_id}/photos/{photo_id}/download")
def download_collection_photo(collection_id: str, photo_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    membership = _one(get_supabase().table("loved_collection_photos").select("photo_id").eq("collection_id", collection_id).eq("photo_id", photo_id).execute())
    if not membership:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo is not in this collection"})
    photo = _one(get_supabase().table("photos").select("id, storage_path").eq("id", photo_id).execute())
    if not photo:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo not found"})
    filename = photo["storage_path"].rsplit("/", 1)[-1]
    return Response(get_supabase().storage.from_(BUCKET).download(photo["storage_path"]), media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.delete("/{collection_id}")
def delete_collection(collection_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    get_supabase().table("loved_collections").delete().eq("id", collection_id).eq("user_id", user.id).execute()
    return {"success": True, "collection_id": collection_id}


@router.get("/{collection_id}/download")
def download_collection(collection_id: str, user: CurrentUser):
    collection = _detail(_owned(collection_id, user.id), user.id)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        for photo in collection["photos"]:
            zipped.writestr(photo["filename"], get_supabase().storage.from_(BUCKET).download(photo["storage_path"]))
    return Response(archive.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{collection["name"]}.zip"'})


def _active_share(token: str) -> dict:
    share = _one(get_supabase().table("loved_collection_shares").select("id, collection_id, expires_at, revoked_at").eq("share_token", token).execute())
    if not share or share.get("revoked_at"):
        raise HTTPException(status_code=404, detail={"success": False, "message": "Shared collection is unavailable"})
    expires_at = share.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail={"success": False, "message": "This collection link has expired"})
    return share


@router.post("/{collection_id}/share", status_code=201)
def create_share(collection_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    existing_rows = get_supabase().table("loved_collection_shares").select("id, share_token, expires_at, created_at").eq("collection_id", collection_id).is_("revoked_at", "null").order("created_at", desc=True).limit(1).execute().data or []
    existing = existing_rows[0] if existing_rows else None
    if existing and (not existing.get("expires_at") or datetime.fromisoformat(existing["expires_at"].replace("Z", "+00:00")) > datetime.now(timezone.utc)):
        return {"success": True, "share": existing}
    token = secrets.token_urlsafe(32)
    row = _one(get_supabase().table("loved_collection_shares").insert({"collection_id": collection_id, "share_token": token}).select("id, share_token, created_at").execute())
    return {"success": True, "share": row}


@router.get("/{collection_id}/share")
def get_active_share(collection_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    rows = get_supabase().table("loved_collection_shares").select("id, share_token, expires_at, created_at").eq("collection_id", collection_id).is_("revoked_at", "null").order("created_at", desc=True).limit(1).execute().data or []
    share = rows[0] if rows else None
    if share and share.get("expires_at") and datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        share = None
    return {"success": True, "share": share}


@router.delete("/{collection_id}/share/{share_id}")
def revoke_share(collection_id: str, share_id: str, user: CurrentUser):
    _owned(collection_id, user.id)
    updated = _one(get_supabase().table("loved_collection_shares").update({"revoked_at": datetime.now(timezone.utc).isoformat()}).eq("id", share_id).eq("collection_id", collection_id).is_("revoked_at", "null").select("id").execute())
    if not updated:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Active share not found"})
    return {"success": True, "share_id": share_id}
