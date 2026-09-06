const express = require("express");

const {
    uploadSingleImage,
    validateEventId
} = require("../middleware/uploadValidation");

const {
    uploadPhoto
} = require("../controllers/photoController");

const router = express.Router();

router.post(
    "/",
    uploadSingleImage,
    validateEventId,
    uploadPhoto
);

module.exports = router;