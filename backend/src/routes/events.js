const {
    generateAccessCode,
    hashAccessCode,
    verifyAccessCode,
} = require("../utils/accessCode");

const express = require("express");

const supabase = require("../services/supabaseService");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// =====================================================
// POST /api/events
// Create a new event
// =====================================================
router.post("/", requireAuth, async (req, res) => {
    try {
        const { name, date } = req.body;

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

// =====================================================
// POST /api/events/access-code/redeem
// Redeem an event access code
// =====================================================
router.post("/access-code/redeem", requireAuth, async (req, res, next) => {
    try {
        const { access_code } = req.body;

        if (!access_code || typeof access_code !== "string") {
            return res.status(400).json({
                success: false,
                message: "Access code is required",
            });
        }

        const normalizedCode = access_code.trim().toUpperCase();

        // Find events that have an access-code hash.
        const { data: events, error: eventsError } = await supabase
            .from("events")
            .select(
                "id, name, date, created_at, owner_id, access_code_hash"
            )
            .not("access_code_hash", "is", null);

        if (eventsError) {
            return next(eventsError);
        }

        // Find the event whose stored hash matches the supplied code.
        const event = (events || []).find((item) =>
            verifyAccessCode(normalizedCode, item.access_code_hash)
        );

        if (!event) {
            return res.status(400).json({
                success: false,
                message: "Invalid access code",
            });
        }

        // Owner already has access.
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

        // Check whether this user already has access.
        const { data: existingAccess, error: existingAccessError } =
            await supabase
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

        // Grant access to the authenticated user.
        const { error: insertError } = await supabase
            .from("event_access")
            .insert({
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

// =====================================================
// POST /api/events/:eventId/access-code
// Generate an access code for an event
// Owner only
// =====================================================
router.post("/:eventId/access-code", requireAuth, async (req, res, next) => {
    try {
        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: "Event ID is required",
            });
        }

        // Verify that the logged-in user owns this event.
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

        // Generate a cryptographically secure plaintext code.
        const accessCode = generateAccessCode();

        // Store only the hash in Supabase.
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

        // Return plaintext code only in this successful response.
        return res.status(200).json({
            success: true,
            event_id: eventId,
            access_code: accessCode,
        });
    } catch (error) {
        return next(error);
    }
});

// =====================================================
// GET /api/events
// Return only events owned by or shared with current user
// =====================================================
router.get("/", requireAuth, async (req, res) => {
    try {
        // Get events owned by the authenticated user.
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

        // Get event IDs explicitly shared with the authenticated user.
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

        const sharedEventIds = (accessRows || []).map(
            (row) => row.event_id
        );

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

        // Merge and remove duplicates.
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