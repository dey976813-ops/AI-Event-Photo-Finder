from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.dependencies import CurrentUser
from app.services.ai_service import get_embedding
from app.services.authorization import can_access_event
from app.services.supabase_service import get_supabase

router = APIRouter(prefix="/api/match", tags=["matching"])

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
    if not embedding:
        raise HTTPException(status_code=400, detail={"success": False, "error": (result or {}).get("error") or (result or {}).get("code") or "Could not generate face embedding", "ai": result})
    if not isinstance(embedding, list) or len(embedding) != 512:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Invalid face embedding. Expected 512 dimensions."})
    rpc_args = {"query_embedding": embedding, "match_threshold": threshold, "match_count": match_count, "target_event_id": selected_event_id}
    try:
        # The SQL function's fourth argument is target_event_id. Passing a
        # different key can silently prevent filtering on installations where
        # PostgREST accepts the call but does not bind the intended event.
        # Matching is always constrained to the event authorized above.
        queries = result.get("embeddings") or [embedding]
        merged = {}
        for query in queries:
            rows = get_supabase().rpc("match_photo_faces", {**rpc_args, "query_embedding": query}).execute().data or []
            for row in rows:
                if row["id"] not in merged or (row.get("similarity") or 0) > (merged[row["id"]].get("similarity") or 0): merged[row["id"]] = row
        matched = list(merged.values())
    except Exception as exc:
        # A few early local deployments used filter_event_id. Retain a narrow
        # compatibility retry while new/current schema uses target_event_id.
        try:
            legacy_args = {"query_embedding": embedding, "match_threshold": 0.5, "match_count": 20, "filter_event_id": selected_event_id}
            matched = get_supabase().rpc("match_photos", legacy_args).execute().data or []
        except Exception:
            raise HTTPException(status_code=500, detail={"success": False, "error": "Photo matching failed"}) from exc
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
    try:
        get_supabase().table("event_activity").insert({"event_id": selected_event_id, "user_id": user.id, "kind": "match_search"}).execute()
    except Exception:
        # Keep matching compatible until the additive analytics migration runs.
        pass
    return {"success": True, "event_id": selected_event_id, "matches": matches, "count": len(matches), "face_count": result.get("face_count", 1), "quality": result.get("quality"), "threshold": threshold}
