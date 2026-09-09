const axios = require("axios");
const FormData = require("form-data");

async function getEmbedding(imageBuffer, filename) {
    try {
        const formData = new FormData();

        // The AI API expects the field name to be exactly "file"
        formData.append("file", imageBuffer, filename);

        const response = await axios.post(
            `${process.env.AI_SERVICE_URL}/embed`,
            formData,
            {
                headers: formData.getHeaders()
            }
        );

        return response.data;

    } catch (error) {
        console.error(
            "AI Service Error:",
            error.response?.data || error.message
        );

        throw error;
    }
}

module.exports = {
    getEmbedding
};
