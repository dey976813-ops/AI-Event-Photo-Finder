const crypto = require("crypto");
const path = require("path");
const supabase = require("../services/supabaseService");
const { getEmbedding } = require("../services/aiService");

const uploadPhoto = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Image file is required"
            });
        }

        const { event_id } = req.body;

        // Check that the event actually exists
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("id, owner_id")
            .eq("id", event_id)
            .maybeSingle();

        if (eventError) {
            console.error("Event lookup error:", eventError);

            return res.status(500).json({
                success: false,
                message: "Could not verify event"
            });
        }

        if (!event) {
            return res.status(404).json({
                success: false,
                message: "Event not found"
            });
        }

        // Only the event owner can upload photos.
        // Users who only have event_access cannot upload.
        if (event.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "Only the event owner can upload photos"
            });
        }

        // Generate a unique filename
        const extension = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${extension} `;

        // Storage path
        const filePath = `${event_id}/${fileName}`;

        // Upload image to private Supabase Storage
        const { data: storageData, error: storageError } = await supabase
            .storage
            .from("event-photos")
            .upload(filePath, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (storageError) {
            console.error("Storage upload error:", storageError);

            return res.status(500).json({
                success: false,
                message: "Photo upload failed",
                error: storageError.message
            });
        }

        // Insert photo metadata into photos table
        const { data: photo, error: photoError } = await supabase
            .from("photos")
            .insert({
                event_id: event_id,
                storage_path: storageData.path
            })
            .select("id, event_id, storage_path, created_at")
            .single();

        if (photoError) {
            console.error("Photo database insert error:", photoError);

            // Remove uploaded file if database insert fails
            await supabase
                .storage
                .from("event-photos")
                .remove([filePath]);

            return res.status(500).json({
                success: false,
                message: "Photo metadata save failed",
                error: photoError.message
            });
        }

        const aiResult = await getEmbedding(
            req.file.buffer,
            req.file.originalname
        );

        console.log("AI embedding received:", {
            face_found: aiResult.face_found,
            face_count: aiResult.face_count,
            embedding_length: aiResult.embedding?.length
        });

        const { error: embeddingError } = await supabase
            .from("photos")
            .update({
                embedding: aiResult.embedding
            })
            .eq("id", photo.id);

        if (embeddingError) {
            console.error("Embedding save error:", embeddingError);

            return res.status(500).json({
                success: false,
                message: "Embedding save failed",
                error: embeddingError.message
            });
        }

        return res.status(201).json({
            success: true,
            message: "Photo uploaded successfully",
            data: {
                photo_id: photo.id,
                event_id: photo.event_id,
                storage_path: photo.storage_path,
                created_at: photo.created_at
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    uploadPhoto
};
