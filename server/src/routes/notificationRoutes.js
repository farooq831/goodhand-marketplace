const express = require("express");
const authenticate = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

const router = express.Router();
router.use(authenticate);

// Not in Architecture.md's literal endpoint list, but a service with no
// way to read what it created isn't useful — the NotificationBell UI
// itself (task 5.6) consumes these.
router.get("/", notificationController.getMine);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/:id/read", notificationController.markRead);

module.exports = router;
