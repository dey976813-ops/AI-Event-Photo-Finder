require("dotenv").config();
const errorHandler = require("./middleware/errorHandler");
const express = require("express");
const cors = require("cors");
const supabase = require("./services/supabaseService");
const photoRoutes = require("./routes/photos");


const app = express();

app.use(cors());
app.use(express.json());


app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});

app.get("/test-supabase", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("events")
            .select("id")
            .limit(1);

        if (error) {
            console.error("Supabase error:", error);

            return res.status(500).json({
                success: false,
                message: "Supabase connection failed",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Supabase connection successful",
            data
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Supabase connection failed"
        });
    }
});

app.get("/test-storage", async (req, res) => {
    try {
        const { data, error } = await supabase.storage.listBuckets();

        if (error) {
            console.error("Storage error:", error);

            return res.status(500).json({
                success: false,
                message: "Storage access failed",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Storage access successful",
            buckets: data.map(bucket => ({
                name: bucket.name,
                public: bucket.public
            }))
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Storage access failed",
            error: error.message
        });
    }
});

app.get("/test-storage-files", async (req, res) => {
    try {
        const { data, error } = await supabase
            .storage
            .from("event-photos")
            .list("24ee89f2-f8dd-412f-98f8-912d00ac707f", {
                limit: 20,
                offset: 0
            });

        if (error) {
            console.error("Storage files error:", error);

            return res.status(500).json({
                success: false,
                message: "Could not list storage files",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Storage files retrieved successfully",
            files: data
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Storage files request failed",
            error: error.message
        });
    }
});

app.get("/test-photo/:photoId", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("photos")
            .select("*")
            .eq("id", req.params.photoId)
            .single();

        if (error) {
            console.error("Photo query error:", error);

            return res.status(500).json({
                success: false,
                message: "Could not retrieve photo",
                error: error.message
            });
        }

        res.json({
            success: true,
            message: "Photo retrieved successfully",
            data
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Photo query failed",
            error: error.message
        });
    }
});

app.use("/photos", photoRoutes);
app.use(errorHandler);
module.exports = app;