const {
  generateAccessCode,
  hashAccessCode,
  verifyAccessCode,
} = require("../utils/accessCode");

const express = require("express");

const supabase = require("../services/supabaseService");
const { requireAuth } = require("../middleware/auth");
const { canAccessEvent } = require("../services/eventAuthorization");

const router = express.Router();

const STORAGE_BUCKET = "event-photos";
const SIGNED_URL_EXPIRES_IN = 60 * 60;

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, date } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Event name is required",
      });
    }

    const eventData = {
      name: name.trim(),
      owner_id: req.user.id,
    };

    if (date !== undefined && date !== null && date !== "") {
      eventData.date = date;
    }

    const { data, error } = await supabase
      .from("events")
      .insert(eventData)
      .select("id, name, date, created_at, owner_id")
      .single();

    if (error) {
      console.error("Event creation error:", error);

      return res.status(500).json({
        success: false,
        message: "Could not create event",
      });
    }

    return res.status(201).json({
      success: true,
      event: data,
    });
  } catch (error) {
    console.error("Create event API error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create event",
    });
  }
});

router.post("/access-code/redeem", requireAuth, async (req, res, next) => {
  try {
    const { access_code } = req.body || {};

    if (!access_code || typeof access_code !== "string") {
      return res.status(400).json({
        success: false,
        message: "Access code is required",
      });
    }

    const normalizedCode = access_code.trim().toUpperCase();

    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, name, date, created_at, owner_id, access_code_hash")
      .not("access_code_hash", "is", null);

    if (eventsError) {
      return next(eventsError);
    }

    const event = (events || []).find((item) =>
      verifyAccessCode(normalizedCode, item.access_code_hash),
    );

    if (!event) {
      return res.status(400).json({
        success: false,
        message: "Invalid access code",
      });
    }

    if (event.owner_id === req.user.id) {
      return res.status(200).json({
        success: true,
        message: "You already have access to this event",
        event: {
          id: event.id,
          name: event.name,
          date: event.date,
          created_at: event.created_at,
          owner_id: event.owner_id,
        },
      });
    }

    const { data: existingAccess, error: existingAccessError } = await supabase
      .from("event_access")
      .select("id")
      .eq("event_id", event.id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (existingAccessError) {
      return next(existingAccessError);
    }

    if (existingAccess) {
      return res.status(200).json({
        success: true,
        message: "You already have access to this event",
        event: {
          id: event.id,
          name: event.name,
          date: event.date,
          created_at: event.created_at,
          owner_id: event.owner_id,
        },
      });
    }

    const { error: insertError } = await supabase.from("event_access").insert({
      event_id: event.id,
      user_id: req.user.id,
    });

    if (insertError) {
      return next(insertError);
    }

    return res.status(200).json({
      success: true,
      message: "Event access granted",
      event: {
        id: event.id,
        name: event.name,
        date: event.date,
        created_at: event.created_at,
        owner_id: event.owner_id,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:eventId/access-code", requireAuth, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, owner_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return next(eventError);
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the event owner can generate an access code",
      });
    }

    const accessCode = generateAccessCode();
    const accessCodeHash = hashAccessCode(accessCode);

    const { error: updateError } = await supabase
      .from("events")
      .update({
        access_code_hash: accessCodeHash,
      })
      .eq("id", eventId);

    if (updateError) {
      return next(updateError);
    }

    return res.status(200).json({
      success: true,
      event_id: eventId,
      access_code: accessCode,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:eventId/photos", requireAuth, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return next(eventError);
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const allowed = await canAccessEvent(req.user.id, eventId);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this event",
      });
    }

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("id, event_id, storage_path, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (photosError) {
      return next(photosError);
    }

    const results = [];

    for (const photo of photos || []) {
      if (!photo.storage_path) {
        continue;
      }

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(photo.storage_path, SIGNED_URL_EXPIRES_IN);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error(
          "Signed URL error:",
          signedUrlError || "Missing signed URL",
        );
        continue;
      }

      results.push({
        id: photo.id,
        event_id: photo.event_id,
        storage_path: photo.storage_path,
        created_at: photo.created_at,
        url: signedUrlData.signedUrl,
      });
    }

    return res.status(200).json({
      success: true,
      event_id: eventId,
      photos: results,
      count: results.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:eventId", requireAuth, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, owner_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return next(eventError);
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    if (event.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the event owner can delete this event",
      });
    }

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("event_id", eventId);

    if (photosError) {
      return next(photosError);
    }

    const storagePaths = [
      ...new Set(
        (photos || [])
          .map((photo) => photo.storage_path)
          .filter(
            (storagePath) => typeof storagePath === "string" && storagePath,
          ),
      ),
    ];

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths);

      if (storageError) {
        console.error("Event storage cleanup error:", storageError);

        return res.status(500).json({
          success: false,
          message: "Could not remove event media",
        });
      }
    }

    const { error: accessDeleteError } = await supabase
      .from("event_access")
      .delete()
      .eq("event_id", eventId);

    if (accessDeleteError) {
      return next(accessDeleteError);
    }

    const { data: deletedEvent, error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("owner_id", req.user.id)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      return next(deleteError);
    }

    if (!deletedEvent) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
      event_id: eventId,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { data: ownedEvents, error: ownedError } = await supabase
      .from("events")
      .select("id, name, date, created_at, owner_id")
      .eq("owner_id", req.user.id)
      .order("date", { ascending: false });

    if (ownedError) {
      console.error("Owned events fetch error:", ownedError);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve events",
      });
    }

    const { data: accessRows, error: accessError } = await supabase
      .from("event_access")
      .select("event_id")
      .eq("user_id", req.user.id);

    if (accessError) {
      console.error("Event access fetch error:", accessError);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve event access",
      });
    }

    const sharedEventIds = (accessRows || []).map((row) => row.event_id);

    let sharedEvents = [];

    if (sharedEventIds.length > 0) {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, created_at, owner_id")
        .in("id", sharedEventIds)
        .order("date", { ascending: false });

      if (error) {
        console.error("Shared events fetch error:", error);

        return res.status(500).json({
          success: false,
          message: "Could not retrieve accessible events",
        });
      }

      sharedEvents = data || [];
    }

    const eventsMap = new Map();

    for (const event of ownedEvents || []) {
      eventsMap.set(event.id, event);
    }

    for (const event of sharedEvents) {
      eventsMap.set(event.id, event);
    }

    const events = Array.from(eventsMap.values());

    return res.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("Get events API error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve events",
    });
  }
});

module.exports = router;
