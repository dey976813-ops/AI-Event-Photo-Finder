import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.dependencies import CurrentUser
from app.services.ai_service import get_embedding
from app.services.authorization import get_event
from app.services.image_hash import hamming_distance, perceptual_hash
from app.services.supabase_service import get_supabase

router = APIRouter(prefix="/photos", tags=["photos"])
logger = logging.getLogger(__name__)
BUCKET = "event-photos"
MAX_FILE_SIZE = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
NEAR_DUPLICATE_DISTANCE = 8


def cleanup(photo_id: str | None, storage_path: str | None) -> None:
    supabase = get_supabase()
    try:
        if photo_id:
            supabase.table("photos").delete().eq("id", photo_id).execute()
        if storage_path:
            supabase.storage.from_(BUCKET).remove([storage_path])
    except Exception:
        logger.exception("Upload rollback failed")


def duplicate_matches(event_id: str, image_hash: str) -> list[dict]:
    rows = get_supabase().table("photos").select("id, storage_path, perceptual_hash, created_at").eq("event_id", event_id).not_.is_("perceptual_hash", "null").execute().data or []
    matches = []
    for row in rows:
        candidate = row.get("perceptual_hash")
        try:
            distance = hamming_distance(image_hash, candidate)
        except (TypeError, ValueError):
            continue
        if distance <= NEAR_DUPLICATE_DISTANCE:
            matches.append({"photo_id": row["id"], "distance": distance, "created_at": row.get("created_at")})
    return sorted(matches, key=lambda item: item["distance"])


def process_photo(photo_id: str, content: bytes, filename: str, content_type: str | None) -> None:
    """Persist real AI processing status for a photo already stored privately."""
    supabase = get_supabase()
    try:
        supabase.table("photos").update({"processing_status": "processing"}).eq("id", photo_id).execute()
        ai_result = get_embedding(content, filename, content_type)
        embedding = ai_result.get("embedding") if ai_result else None
        embeddings = ai_result.get("embeddings") or ([embedding] if embedding else [])
        if not isinstance(embedding, list) or len(embedding) != 512 or not all(isinstance(item, list) and len(item) == 512 for item in embeddings):
            raise ValueError("AI returned invalid face embeddings")
        supabase.table("photos").update({"embedding": embedding, "face_count": len(embeddings), "processing_status": "ready"}).eq("id", photo_id).execute()
        supabase.table("photo_faces").upsert([{"photo_id": photo_id, "face_index": index, "embedding": value} for index, value in enumerate(embeddings)], on_conflict="photo_id,face_index").execute()
    except Exception:
        logger.exception("AI processing failed for photo_id=%s", photo_id)
        supabase.table("photos").update({"processing_status": "failed"}).eq("id", photo_id).execute()


@router.post("", status_code=201)
def upload_photo(background_tasks: BackgroundTasks, file: UploadFile | None = File(default=None), event_id: str | None = Form(default=None), user: CurrentUser = None):
    if not file or not event_id:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Image file and event_id are required"})
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Only JPEG, PNG, and WebP images are allowed"})
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail={"success": False, "message": "File size is too large. Maximum allowed size is 5 MB."})
    try:
        image_hash = perceptual_hash(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Could not read this image"}) from exc
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != user.id:
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can upload photos"})
    duplicates = duplicate_matches(event_id, image_hash)
    path = f"{event_id}/{uuid.uuid4()}{os.path.splitext(file.filename or '')[1].lower()}"
    photo_id: str | None = None
    try:
        storage = get_supabase().storage.from_(BUCKET).upload(path, content, {"content-type": file.content_type, "upsert": "false"})
        response = get_supabase().table("photos").insert({"event_id": event_id, "storage_path": storage.path or path, "perceptual_hash": image_hash, "processing_status": "pending"}).select("id").execute()
        photo = (response.data or [None])[0]
        if not photo: raise RuntimeError("Supabase did not return the created photo")
        photo_id = photo["id"]
    except Exception as exc:
        cleanup(photo_id, path)
        raise HTTPException(status_code=500, detail={"success": False, "message": "Photo upload failed"}) from exc
    background_tasks.add_task(process_photo, photo_id, content, file.filename or "image", file.content_type)
    return {"success": True, "message": "Photo uploaded and queued for AI processing", "data": {"photo_id": photo_id, "event_id": event_id, "processing_status": "pending", "duplicates": duplicates}}

@router.delete("/{photo_id}")
def delete_photo(photo_id: str, user: CurrentUser):
    """Permanently remove exactly one owner-owned photo and its storage object."""
    supabase = get_supabase()
    try:
        response = supabase.table("photos").select("id, event_id, storage_path").eq("id", photo_id).execute()
        rows = response.data or []
        photo = rows[0] if isinstance(rows, list) and rows else rows
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not delete this photo"}) from exc
    if not photo:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Photo not found"})
    event = get_event(photo["event_id"])
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != user.id:
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can delete photos"})
    try:
        # Favorites are explicitly removed in case the migration was applied
        # without a cascading foreign key.
        supabase.table("photo_favorites").delete().eq("photo_id", photo_id).execute()
        supabase.table("photos").delete().eq("id", photo_id).execute()
        if photo.get("storage_path"):
            supabase.storage.from_(BUCKET).remove([photo["storage_path"]])
    except Exception as exc:
        logger.exception("Photo deletion failed")
        raise HTTPException(status_code=500, detail={"success": False, "message": "Could not delete this photo"}) from exc
    return {"success": True, "photo_id": photo_id, "event_id": photo["event_id"]}
