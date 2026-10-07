const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const requireVerifiedEmail = require("../middleware/requireVerifiedEmail");
const bookingController = require("../controllers/bookingController");

const router = express.Router();

router.use(authenticate);
// /me before /:id so Express doesn't treat "me" as an id param.
router.get("/me", bookingController.getMine);
router.post("/", requireRole("customer"), requireVerifiedEmail, bookingController.create);
router.get("/:id", bookingController.getOne);
router.patch("/:id/status", bookingController.updateStatus);

module.exports = router;
