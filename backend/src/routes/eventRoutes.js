const express = require("express");
const router = express.Router();

const { getMyEvents } = require("../controllers/eventController");

// Authentication middleware will be added when we wire this route
router.get("/", getMyEvents);

module.exports = router;