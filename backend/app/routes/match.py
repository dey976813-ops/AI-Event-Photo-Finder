from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.dependencies import CurrentUser
from app.services.ai_service import get_embedding
from app.services.authorization import can_access_event
from app.services.supabase_service import get_supabase

router = APIRouter(prefix="/api/match", tags=["matching"])


@router.post("")
def match_photos(file: UploadFile | None = File(default=None), event_id: str | None = Form(default=None), eventId: str | None = Form(default=None), user: CurrentUser = None):
    if not file:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Face image is required"})
    selected_event_id = event_id or eventId
    if not selected_event_id:
        raise HTTPException(status_code=400, detail={"success": False, "error": "event_id is required"})
    if not can_access_event(user.id, selected_event_id):
        raise HTTPException(status_code=403, detail={"success": False, "error": "You do not have access to this event"})
    result = get_embedding(file.file.read(), file.filename or "image", file.content_type)
    embedding = result.get("embedding") if result else None
    if not embedding:
        raise HTTPException(status_code=400, detail={"success": False, "error": (result or {}).get("error") or (result or {}).get("code") or "Could not generate face embedding", "ai": result})
    if not isinstance(embedding, list) or len(embedding) != 512:
        raise HTTPException(status_code=400, detail={"success": False, "error": "Invalid face embedding. Expected 512 dimensions."})
    try:
        matched = get_supabase().rpc("match_photos", {"query_embedding": embedding, "match_threshold": 0.5, "match_count": 20, "filter_event_id": selected_event_id}).execute().data or []
    except Exception as exc:
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
    return {"success": True, "event_id": selected_event_id, "matches": matches, "count": len(matches)}
