const express = require("express");
const multer = require("multer");

const { getEmbedding } = require("../services/aiService");
const supabase = require("../services/supabaseService");
const { requireAuth } = require("../middleware/auth");
const { canAccessEvent } = require("../services/eventAuthorization");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});

// =========================
// POST /api/match
// =========================
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      // -------------------------
      // Validate selfie
      // -------------------------
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Face image is required",
        });
      }

      // -------------------------
      // Validate event
      // -------------------------
      const eventId = req.body.event_id || req.body.eventId;

      if (!eventId) {
        return res.status(400).json({
          success: false,
          error: "event_id is required",
        });
      }

      // -------------------------
      // Verify event access
      // -------------------------
      const hasAccess = await canAccessEvent(req.user.id, eventId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: "You do not have access to this event",
        });
      }

      // -------------------------
      // Generate selfie embedding
      // -------------------------
      const aiResult = await getEmbedding(
        req.file.buffer,
        req.file.originalname
      );

      if (!aiResult || !aiResult.embedding) {
        return res.status(400).json({
          success: false,
          error: "Could not generate face embedding",
          ai: aiResult,
        });
      }

      // -------------------------
      // Validate embedding
      // -------------------------
      if (
        !Array.isArray(aiResult.embedding) ||
        aiResult.embedding.length !== 512
      ) {
        return res.status(400).json({
          success: false,
          error: "Invalid face embedding. Expected 512 dimensions.",
        });
      }

      // -------------------------
      // Vector similarity search
      // -------------------------
      const { data, error } = await supabase.rpc("match_photos", {
        query_embedding: aiResult.embedding,
        match_threshold: 0.6,
        match_count: 20,
        target_event_id: eventId,
      });

      if (error) {
        console.error("Supabase match error:", error);

        return res.status(500).json({
          success: false,
          error: "Photo matching failed",
          details: error.message,
        });
      }

      // -------------------------
      // Generate signed URLs
      // -------------------------
      const matches = [];

      for (const photo of data || []) {
        if (!photo.storage_path) {
          continue;
        }

        // Defense-in-depth:
        // Never generate a URL for a photo belonging to another event.
        if (photo.event_id !== eventId) {
          continue;
        }

        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from("event-photos")
            .createSignedUrl(photo.storage_path, 60 * 60);

        if (signedUrlError) {
          console.error(
            `Signed URL error for ${ photo.storage_path }: `,
            signedUrlError
          );

          continue;
        }

        if (!signedUrlData?.signedUrl) {
          continue;
        }

        matches.push({
          id: photo.id,
          event_id: photo.event_id,
          storage_path: photo.storage_path,
          similarity: photo.similarity,
          url: signedUrlData.signedUrl,
        });
      }

      // -------------------------
      // Final response
      // -------------------------
      return res.json({
        success: true,
        event_id: eventId,
        matches,
        count: matches.length,
      });
    } catch (error) {
      console.error("Match error:", error);

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
