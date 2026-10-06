const express = require("express");
const authenticate = require("../middleware/auth");
const messageController = require("../controllers/messageController");

const router = express.Router();
router.use(authenticate);
router.get("/booking/:bookingId", messageController.getForBooking);
router.post("/booking/:bookingId", messageController.createForBooking);

module.exports = router;
