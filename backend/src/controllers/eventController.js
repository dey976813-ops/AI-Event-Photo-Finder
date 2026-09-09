const { supabase } = require("../services/supabaseService");

const getMyEvents = async (req, res) => {
    try {
        // req.user is populated by the existing authentication middleware
        const userId = req.user.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const { data, error } = await supabase
            .from("events")
            .select("id, name, owner_id, created_at")
            .eq("owner_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Get events error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch events"
            });
        }

        return res.status(200).json({
            success: true,
            events: data || []
        });

    } catch (error) {
        console.error("Get events unexpected error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

module.exports = {
    getMyEvents
};