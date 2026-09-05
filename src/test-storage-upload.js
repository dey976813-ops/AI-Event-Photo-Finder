require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use a REAL event_id from Sahoo's existing events table
const eventId = "24ee89f2-f8dd-412f-98f8-912d00ac707f";

// Change this to the name of your test image
const imagePath = path.join(__dirname, "../test-image.jpg");

async function testUpload() {
    try {
        console.log("Starting Storage upload test...");

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Test image not found: ${imagePath}`);
        }

        const fileBuffer = fs.readFileSync(imagePath);

        const fileName = `${Date.now()}-test-image.jpg`;

        // Required path convention:
        // {event_id}/{unique-filename}
        const storagePath = `${eventId}/${fileName}`;

        console.log("Uploading to:", storagePath);

        const { data, error } = await supabase.storage
            .from("event-photos")
            .upload(storagePath, fileBuffer, {
                contentType: "image/jpeg",
                upsert: false
            });

        if (error) {
            throw error;
        }

        console.log("=================================");
        console.log("UPLOAD SUCCESSFUL");
        console.log("=================================");
        console.log("Bucket: event-photos");
        console.log("Storage path:", data.path);
    } catch (error) {
        console.error("=================================");
        console.error("UPLOAD FAILED");
        console.error("=================================");
        console.error(error.message);
    }
}

testUpload();