require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { getEmbedding } = require("./services/aiService");

async function testAIService() {
    try {
        console.log("Starting AI service test...");

        // Change this to the path of your test image
        const imagePath = path.join(__dirname, "../test-image.jpg");

        if (!fs.existsSync(imagePath)) {
            throw new Error(`Test image not found: ${imagePath}`);
        }

        const imageBuffer = fs.readFileSync(imagePath);

        console.log("Image loaded successfully.");
        console.log("Sending image to AI service...");

        const result = await getEmbedding(
            imageBuffer,
            "test-image.jpg"
        );

        console.log("\nAI service response:");
        console.log(JSON.stringify(result, null, 2));

        if (result.face_found === true) {
            console.log("\nFace found:", result.face_found);
            console.log("Face count:", result.face_count);
            console.log("Embedding dimension:", result.embedding.length);
        } else {
            console.log("\nNo face detected.");
        }

    } catch (error) {
        console.error("\nAI service test failed:");
        console.error(error.message);
    }
}

testAIService();