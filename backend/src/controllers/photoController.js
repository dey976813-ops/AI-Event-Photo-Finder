const crypto = require("crypto");
const path = require("path");

const supabase = require("../services/supabaseService");
const { getEmbedding } = require("../services/aiService");

const STORAGE_BUCKET = "event-photos";
const EMBEDDING_DIMENSIONS = 512;

const uploadPhoto = async (req, res, next) => {
  let uploadedFilePath = null;
  let createdPhotoId = null;

  try {
    // =========================
    // Validate uploaded file
    // =========================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const { event_id: eventId } = req.body || {};

    if (!eventId || typeof eventId !== "string") {
      return res.status(400).json({
        success: false,
        message: "event_id is required",
      });
    }

    // =========================
    // Verify event
    // =========================
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, owner_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("Event lookup error:", eventError);

      return res.status(500).json({
        success: false,
        message: "Could not verify event",
      });
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // =========================
    // Upload authorization
    // =========================
    // Only the event owner can upload.
    // A shared/event_access user may view/match,
    // but cannot upload event photos.
    if (event.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the event owner can upload photos",
      });
    }

    // =========================
    // Generate unique filename
    // =========================
    const extension = path.extname(req.file.originalname).toLowerCase();

    const fileName = `${crypto.randomUUID()}${extension}`;

    // Storage path:
    // {event_id}/{unique-filename}
    const filePath = `${eventId}/${fileName}`;
    uploadedFilePath = filePath;

    // =========================
    // Upload to private Storage
    // =========================
    const { data: storageData, error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (storageError) {
      console.error("Storage upload error:", storageError);

      return res.status(500).json({
        success: false,
        message: "Photo upload failed",
      });
    }

    // =========================
    // Insert photo metadata
    // =========================
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .insert({
        event_id: eventId,
        storage_path: storageData.path,
      })
      .select("id, event_id, storage_path, created_at")
      .single();

    if (photoError) {
      console.error("Photo database insert error:", photoError);

      // Roll back storage upload if metadata insert fails.
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

      uploadedFilePath = null;

      return res.status(500).json({
        success: false,
        message: "Photo metadata save failed",
      });
    }

    createdPhotoId = photo.id;

    // =========================
    // Generate face embedding
    // =========================
    let aiResult;

    try {
      aiResult = await getEmbedding(req.file.buffer, req.file.originalname);
    } catch (aiError) {
      console.error("AI embedding error:", aiError);

      // Roll back DB row and storage file.
      await supabase.from("photos").delete().eq("id", createdPhotoId);

      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

      return res.status(502).json({
        success: false,
        message: "AI face processing failed",
      });
    }

    console.log("AI embedding received:", {
      face_found: aiResult?.face_found,
      face_count: aiResult?.face_count,
      embedding_length: aiResult?.embedding?.length,
      error: aiResult?.error || aiResult?.code || null,
    });

    // =========================
    // Handle controlled AI errors
    // =========================
    if (!aiResult?.embedding) {
      const aiCode =
        aiResult?.code || aiResult?.error || "FACE_PROCESSING_FAILED";

      // Roll back DB row and storage file.
      await supabase.from("photos").delete().eq("id", createdPhotoId);

      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

      return res.status(400).json({
        success: false,
        error: aiCode,
        message:
          aiCode === "NO_FACE"
            ? "No usable face was detected in the image"
            : "Could not generate face embedding",
      });
    }

    // =========================
    // Validate embedding
    // =========================
    if (
      !Array.isArray(aiResult.embedding) ||
      aiResult.embedding.length !== EMBEDDING_DIMENSIONS ||
      !aiResult.embedding.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      console.error("Invalid AI embedding received");

      // Roll back DB row and storage file.
      await supabase.from("photos").delete().eq("id", createdPhotoId);

      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

      return res.status(502).json({
        success: false,
        message: "AI returned an invalid face embedding",
      });
    }

    // =========================
    // Save 512D embedding
    // =========================
    const { error: embeddingError } = await supabase
      .from("photos")
      .update({
        embedding: aiResult.embedding,
      })
      .eq("id", createdPhotoId);

    if (embeddingError) {
      console.error("Embedding save error:", embeddingError);

      // Roll back DB row and storage file.
      await supabase.from("photos").delete().eq("id", createdPhotoId);

      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

      return res.status(500).json({
        success: false,
        message: "Embedding save failed",
      });
    }

    // =========================
    // Success
    // =========================
    return res.status(201).json({
      success: true,
      message: "Photo uploaded successfully",
      data: {
        photo_id: photo.id,
        event_id: photo.event_id,
        storage_path: photo.storage_path,
        created_at: photo.created_at,
      },
    });
  } catch (error) {
    console.error("Upload photo error:", error);

    // Best-effort cleanup for unexpected failures.
    if (createdPhotoId) {
      try {
        await supabase.from("photos").delete().eq("id", createdPhotoId);
      } catch (cleanupError) {
        console.error("Photo DB cleanup failed:", cleanupError);
      }
    }

    if (uploadedFilePath) {
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([uploadedFilePath]);
      } catch (cleanupError) {
        console.error("Storage cleanup failed:", cleanupError);
      }
    }

    return next(error);
  }
};

module.exports = {
  uploadPhoto,
};
