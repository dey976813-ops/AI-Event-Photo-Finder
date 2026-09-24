import logging
import math
from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.dependencies import CurrentUser
from app.services.ai_service import get_embedding
from app.services.authorization import can_access_event
from app.services.supabase_service import get_supabase

router = APIRouter(prefix="/api/match", tags=["matching"])
logger = logging.getLogger(__name__)

@router.post("/quality")
def face_quality(file: UploadFile = File(...), user: CurrentUser = None):
    result = get_embedding(file.file.read(), file.filename or "image", file.content_type)
    if not result.get("face_found"):
        raise HTTPException(status_code=400, detail={"success": False, "error": result.get("error", "NO_FACE")})
    quality = result.get("quality") or {}
    faces = quality.get("faces") or []
    return {"success": True, "face_count": result.get("face_count", len(faces)), "brightness": quality.get("brightness"), "image_width": quality.get("image_width"), "image_height": quality.get("image_height"), "largest_face_area": max((face.get("relative_area", 0) for face in faces), default=0)}


@router.post("")
def match_photos(file: UploadFile | None = File(default=None), event_id: str | None = Form(default=None), eventId: str | None = Form(default=None), threshold: float = Form(default=0.5, ge=0.5, le=0.95), match_count: int = Form(default=50, ge=1, le=100), user: CurrentUser = None, access_code: Annotated[str | None, Header(alias="X-Event-Access-Code")] = None):
    if not file:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Face image is required"})
    selected_event_id = event_id or eventId
    if not selected_event_id:
        raise HTTPException(status_code=400, detail={"success": False, "error": "event_id is required"})
    if not can_access_event(user.id, selected_event_id, access_code):
        raise HTTPException(status_code=403, detail={"success": False, "error": "You do not have access to this event"})
    result = get_embedding(file.file.read(), file.filename or "image", file.content_type)
    embedding = result.get("embedding") if result else None
    if not result or not result.get("face_found") or not embedding:
        raise HTTPException(status_code=400, detail={"success": False, "error": (result or {}).get("error") or (result or {}).get("code") or "Could not generate face embedding", "ai": result})
    queries = result.get("embeddings") or [embedding]
    if not isinstance(embedding, list) or len(embedding) != 512 or not isinstance(queries, list) or not queries or any(not isinstance(query, list) or len(query) != 512 or not all(isinstance(value, (int, float)) and math.isfinite(value) for value in query) for query in queries):
        raise HTTPException(status_code=400, detail={"success": False, "error": "Invalid face embedding. Expected 512 dimensions."})
    rpc_args = {"query_embedding": embedding, "match_threshold": threshold, "match_count": match_count, "target_event_id": selected_event_id}
    supabase = get_supabase()
    merged: dict[str, dict] = {}
    raw_match_count = 0
    face_rpc_error: Exception | None = None
    legacy_rpc_error: Exception | None = None

    # Search every detected face against all faces indexed for this event.
    # The SQL aggregate groups by photo, so this also retains each photo's
    # strongest actual face similarity.
    try:
        for query in queries:
            rows = supabase.rpc("match_photo_faces", {**rpc_args, "query_embedding": query}).execute().data or []
            raw_match_count += len(rows)
            for row in rows:
                key = str(row.get("id") or "")
                if key and (key not in merged or float(row.get("similarity") or 0) > float(merged[key].get("similarity") or 0)):
                    merged[key] = row
    except Exception as exc:
        face_rpc_error = exc

    # Existing installations may still have valid embeddings only on photos.
    # Search that real legacy index too, using the actual SQL argument name;
    # the prior filter_event_id fallback did not bind the existing RPC.
    try:
        for query in queries:
            legacy_args = {"query_embedding": query, "match_threshold": threshold, "match_count": match_count, "target_event_id": selected_event_id}
            rows = supabase.rpc("match_photos", legacy_args).execute().data or []
            raw_match_count += len(rows)
            for row in rows:
                key = str(row.get("id") or "")
                if key and (key not in merged or float(row.get("similarity") or 0) > float(merged[key].get("similarity") or 0)):
                    merged[key] = row
    except Exception as exc:
        legacy_rpc_error = exc
    if face_rpc_error and legacy_rpc_error:
        logger.error("Both event face indexes failed event_id=%s", selected_event_id)
        raise HTTPException(status_code=500, detail={"success": False, "error": "Photo matching failed"}) from face_rpc_error
    matched = list(merged.values())
    matches = []
    for photo in matched:
        if not photo.get("storage_path") or str(photo.get("event_id")) != str(selected_event_id):
            continue
        try:
            signed = get_supabase().storage.from_("event-photos").create_signed_url(photo["storage_path"], 3600)
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url:
                matches.append({"id": photo["id"], "event_id": photo["event_id"], "storage_path": photo["storage_path"], "similarity": photo.get("similarity"), "url": url})
        except Exception:
            continue
    loved_photo_ids: set[str] = set()
    if matches:
        try:
            favorite_rows = supabase.table("photo_favorites").select("photo_id").eq("user_id", user.id).in_("photo_id", [photo["id"] for photo in matches]).execute().data or []
            loved_photo_ids = {str(row["photo_id"]) for row in favorite_rows}
        except Exception:
            logger.debug("Could not load current-user favorite state event_id=%s", selected_event_id)
    for photo in matches:
        photo["loved"] = str(photo["id"]) in loved_photo_ids
    best_similarity = max((float(photo["similarity"]) for photo in matches if isinstance(photo.get("similarity"), (int, float))), default=None)
    stored_faces_searched = None
    legacy_embedding_photos = None
    try:
        count_response = supabase.table("photo_faces").select("photo_id, photos!inner(event_id)", count="exact", head=True).eq("photos.event_id", selected_event_id).execute()
        stored_faces_searched = count_response.count
    except Exception:
        pass
    try:
        legacy_count_response = supabase.table("photos").select("id", count="exact", head=True).eq("event_id", selected_event_id).not_.is_("embedding", "null").execute()
        legacy_embedding_photos = legacy_count_response.count
    except Exception:
        pass
    searchable_index_empty = stored_faces_searched == 0 and legacy_embedding_photos == 0
    matches.sort(key=lambda photo: float(photo.get("similarity") or 0), reverse=True)
    logger.debug("Face match diagnostics event_id=%s query_faces=%s stored_faces_searched=%s legacy_embedding_photos=%s raw_match_count=%s best_similarity=%s", selected_event_id, len(queries), stored_faces_searched, legacy_embedding_photos, raw_match_count, best_similarity)
    try:
        get_supabase().table("event_activity").insert({"event_id": selected_event_id, "user_id": user.id, "kind": "match_search"}).execute()
    except Exception:
        # Keep matching compatible until the additive analytics migration runs.
        pass
    return {"success": True, "event_id": selected_event_id, "matches": matches, "photos": matches, "count": len(matches), "face_count": len(queries), "quality": result.get("quality"), "threshold": threshold, "searchable_index_empty": searchable_index_empty}
