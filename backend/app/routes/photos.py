# import logging
# import os
# import uuid

# from fastapi import APIRouter, File, Form, HTTPException, UploadFile

# from app.dependencies import CurrentUser
# from app.services.ai_service import get_embedding
# from app.services.authorization import get_event
# from app.services.supabase_service import get_supabase

# router = APIRouter(prefix="/photos", tags=["photos"])
# logger = logging.getLogger(__name__)
# BUCKET = "event-photos"
# MAX_FILE_SIZE = 5 * 1024 * 1024
# ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


# def cleanup(photo_id: str | None, storage_path: str | None) -> None:
#     supabase = get_supabase()
#     try:
#         if photo_id:
#             supabase.table("photos").delete().eq("id", photo_id).execute()
#         if storage_path:
#             supabase.storage.from_(BUCKET).remove([storage_path])
#     except Exception:
#         logger.exception("Upload rollback failed")


# @router.post("", status_code=201)
# def upload_photo(file: UploadFile | None = File(default=None), event_id: str | None = Form(default=None), user: CurrentUser = None):
#     if not file:
#         raise HTTPException(status_code=400, detail={"success": False, "message": "Image file is required"})
#     if not event_id:
#         raise HTTPException(status_code=400, detail={"message": "event_id is required"})
#     if file.content_type not in ALLOWED_TYPES:
#         raise HTTPException(status_code=400, detail={"message": "Invalid image type. Only JPEG, PNG, and WebP images are allowed."})
#     content = file.file.read()
#     if len(content) > MAX_FILE_SIZE:
#         raise HTTPException(status_code=400, detail={"message": "File size is too large. Maximum allowed size is 5 MB."})
#     event = get_event(event_id)
#     if not event:
#         raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
#     if event["owner_id"] != user.id:
#         raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can upload photos"})
#     extension = os.path.splitext(file.filename or "")[1].lower()
#     path = f"{event_id}/{uuid.uuid4()}{extension}"
#     photo_id: str | None = None
#     try:
#         storage = get_supabase().storage.from_(BUCKET).upload(path, content, {"content-type": file.content_type, "upsert": "false"})
#         storage_path = storage.path or path
#         response = get_supabase().table("photos").insert({"event_id": event_id, "storage_path": storage_path}).select("id, event_id, storage_path, created_at").execute()
#         rows = response.data or []
#         photo = rows[0] if isinstance(rows, list) else rows
#         if not photo:
#             raise RuntimeError("Supabase did not return the created photo")
#         photo_id = photo["id"]
#     except Exception as exc:
#         logger.exception("Photo upload or metadata creation failed")
#         cleanup(photo_id, path)
#         raise HTTPException(status_code=500, detail={"success": False, "message": "Photo upload failed"}) from exc
#     try:
#         ai_result = get_embedding(content, file.filename or "image", file.content_type)
#     except HTTPException as exc:
#         cleanup(photo_id, path)
#         raise HTTPException(status_code=502, detail={"success": False, "message": "AI face processing failed"}) from exc
#     embedding = ai_result.get("embedding") if ai_result else None
#     if not embedding:
#         cleanup(photo_id, path)
#         code = ai_result.get("code") or ai_result.get("error") or "FACE_PROCESSING_FAILED"
#         message = "No usable face was detected in the image" if code == "NO_FACE" else "Could not generate face embedding"
#         raise HTTPException(status_code=400, detail={"success": False, "error": code, "message": message})
#     if not isinstance(embedding, list) or len(embedding) != 512 or not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in embedding):
#         cleanup(photo_id, path)
#         raise HTTPException(status_code=502, detail={"success": False, "message": "AI returned an invalid face embedding"})
#     try:
#         get_supabase().table("photos").update({"embedding": embedding}).eq("id", photo_id).execute()
#     except Exception as exc:
#         cleanup(photo_id, path)
#         raise HTTPException(status_code=500, detail={"success": False, "message": "Embedding save failed"}) from exc
#     return {"success": True, "message": "Photo uploaded successfully", "data": {"photo_id": photo["id"], "event_id": photo["event_id"], "storage_path": photo["storage_path"], "created_at": photo["created_at"]}}

import logging
import os
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.dependencies import CurrentUser
from app.services.ai_service import get_embedding
from app.services.authorization import get_event
from app.services.supabase_service import get_supabase

router = APIRouter(prefix="/photos", tags=["photos"])
logger = logging.getLogger(__name__)
BUCKET = "event-photos"
MAX_FILE_SIZE = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def cleanup(photo_id: str | None, storage_path: str | None) -> None:
    supabase = get_supabase()
    try:
        if photo_id:
            supabase.table("photos").delete().eq("id", photo_id).execute()
        if storage_path:
            supabase.storage.from_(BUCKET).remove([storage_path])
    except Exception:
        logger.exception("Upload rollback failed")


@router.post("", status_code=201)
def upload_photo(file: UploadFile | None = File(default=None), event_id: str | None = Form(default=None), user: CurrentUser = None):
    if not file:
        raise HTTPException(status_code=400, detail={"success": False, "message": "Image file is required"})
    if not event_id:
        raise HTTPException(status_code=400, detail={"message": "event_id is required"})
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail={"message": "Invalid image type. Only JPEG, PNG, and WebP images are allowed."})
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail={"message": "File size is too large. Maximum allowed size is 5 MB."})
    event = get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"success": False, "message": "Event not found"})
    if event["owner_id"] != user.id:
        raise HTTPException(status_code=403, detail={"success": False, "message": "Only the event owner can upload photos"})
    extension = os.path.splitext(file.filename or "")[1].lower()
    path = f"{event_id}/{uuid.uuid4()}{extension}"
    photo_id: str | None = None
    try:
        storage = get_supabase().storage.from_(BUCKET).upload(path, content, {"content-type": file.content_type, "upsert": "false"})
        storage_path = storage.path or path
        response = get_supabase().table("photos").insert({"event_id": event_id, "storage_path": storage_path}).select("id, event_id, storage_path, created_at").execute()
        rows = response.data or []
        photo = rows[0] if isinstance(rows, list) else rows
        if not photo:
            raise RuntimeError("Supabase did not return the created photo")
        photo_id = photo["id"]
    except Exception as exc:
        logger.exception("Photo upload or metadata creation failed")
        cleanup(photo_id, path)
        raise HTTPException(status_code=500, detail={"success": False, "message": "Photo upload failed"}) from exc
    try:
        ai_result = get_embedding(content, file.filename or "image", file.content_type)
    except HTTPException as exc:
        cleanup(photo_id, path)
        raise HTTPException(status_code=502, detail={"success": False, "message": "AI face processing failed"}) from exc
    embedding = ai_result.get("embedding") if ai_result else None
    if not embedding:
        cleanup(photo_id, path)
        code = ai_result.get("code") or ai_result.get("error") or "FACE_PROCESSING_FAILED"
        message = "No usable face was detected in the image" if code == "NO_FACE" else "Could not generate face embedding"
        raise HTTPException(status_code=400, detail={"success": False, "error": code, "message": message})
    if not isinstance(embedding, list) or len(embedding) != 512 or not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in embedding):
        cleanup(photo_id, path)
        raise HTTPException(status_code=502, detail={"success": False, "message": "AI returned an invalid face embedding"})
    try:
        get_supabase().table("photos").update({"embedding": embedding}).eq("id", photo_id).execute()
    except Exception as exc:
        cleanup(photo_id, path)
        raise HTTPException(status_code=500, detail={"success": False, "message": "Embedding save failed"}) from exc
    return {"success": True, "message": "Photo uploaded successfully", "data": {"photo_id": photo["id"], "event_id": photo["event_id"], "storage_path": photo["storage_path"], "created_at": photo["created_at"]}}
