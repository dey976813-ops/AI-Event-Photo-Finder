const express = require("express");

const {
    uploadSingleImage,
    validateEventId
} = require("../middleware/uploadValidation");

const {
    uploadPhoto
} = require("../controllers/photoController");

const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post(
    "/",
    requireAuth,
    uploadSingleImage,
    validateEventId,
    uploadPhoto
);

module.exports = router;

