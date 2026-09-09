require("dotenv").config();

const express = require("express");
const cors = require("cors");

const errorHandler = require("./middleware/errorHandler");
const supabase = require("./services/supabaseService");

const photoRoutes = require("./routes/photos");
const matchRoutes = require("./routes/match");
const authRoutes = require("./routes/auth");
const eventsRoutes = require("./routes/events");

const app = express();

// =========================
// Middleware
// =========================
app.use(cors());
app.use(express.json());

// =========================
// Health Check
// =========================
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    message: "Backend is running",
  });
});

// =========================
// Get Events
// Frontend uses this to show event selection
// =========================
app.use("/api/events", eventsRoutes);
// =========================
// Supabase Test
// =========================
app.get("/test-supabase", async (req, res) => {
  try {
    const { data, error } = await supabase.from("events").select("id").limit(1);

    if (error) {
      console.error("Supabase error:", error);

      return res.status(500).json({
        success: false,
        message: "Supabase connection failed",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Supabase connection successful",
      data,
    });
  } catch (error) {
    console.error("Supabase test error:", error);

    return res.status(500).json({
      success: false,
      message: "Supabase connection failed",
      error: error.message,
    });
  }
});

// =========================
// Storage Test
// =========================
app.get("/test-storage", async (req, res) => {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error("Storage error:", error);

      return res.status(500).json({
        success: false,
        message: "Storage access failed",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Storage access successful",
      buckets: data.map((bucket) => ({
        name: bucket.name,
        public: bucket.public,
      })),
    });
  } catch (error) {
    console.error("Storage test error:", error);

    return res.status(500).json({
      success: false,
      message: "Storage access failed",
      error: error.message,
    });
  }
});

// =========================
// Storage Files Test
// =========================
app.get("/test-storage-files", async (req, res) => {
  try {
    const { data, error } = await supabase.storage
      .from("event-photos")
      .list("24ee89f2-f8dd-412f-98f8-912d00ac707f", {
        limit: 20,
        offset: 0,
      });

    if (error) {
      console.error("Storage files error:", error);

      return res.status(500).json({
        success: false,
        message: "Could not list storage files",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Storage files retrieved successfully",
      files: data,
    });
  } catch (error) {
    console.error("Storage files test error:", error);

    return res.status(500).json({
      success: false,
      message: "Storage files request failed",
      error: error.message,
    });
  }
});

// =========================
// Photo Test
// =========================
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
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Photo retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Photo test error:", error);

    return res.status(500).json({
      success: false,
      message: "Photo query failed",
      error: error.message,
    });
  }
});

// =========================
// API Routes
// =========================

// Photo upload
app.use("/photos", photoRoutes);

// AI Face Matching
// POST /api/match
app.use("/api/match", matchRoutes);

// Authentication
// POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me
app.use("/api/auth", authRoutes);

// =========================
// 404 Handler
// =========================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// =========================
// Global Error Handler
// =========================
app.use(errorHandler);

module.exports = app;
