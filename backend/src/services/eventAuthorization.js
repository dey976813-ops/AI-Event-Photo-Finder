const supabase = require("./supabaseService");

/**
 * Check whether a user can access an event.
 *
 * Access is granted when:
 * 1. The user owns the event, OR
 * 2. The user has an event_access row for the event.
 *
 * The user ID always comes from authenticated req.user.id.
 */
async function canAccessEvent(userId, eventId) {
    if (!userId || !eventId) {
        return false;
    }

    // Check event ownership first.
    const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, owner_id")
        .eq("id", eventId)
        .maybeSingle();

    if (eventError) {
        throw eventError;
    }

    if (!event) {
        return false;
    }

    if (event.owner_id === userId) {
        return true;
    }

    // Check explicit event access.
    const { data: access, error: accessError } = await supabase
        .from("event_access")
        .select("id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

    if (accessError) {
        throw accessError;
    }

    return !!access;
}

async function getEventForUser(userId, eventId) {
    if (!userId || !eventId) {
        return null;
    }

    const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, name, date, created_at, owner_id")
        .eq("id", eventId)
        .maybeSingle();

    if (eventError) {
        throw eventError;
    }

    if (!event) {
        return null;
    }

    const allowed = await canAccessEvent(userId, eventId);

    return allowed ? event : null;
}

module.exports = {
    canAccessEvent,
    getEventForUser,
};