const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const requireVerifiedEmail = require("../middleware/requireVerifiedEmail");
const vendorController = require("../controllers/vendorController");

const router = express.Router();

// /me before /:id so Express doesn't treat "me" as an id param.
router.get("/me", authenticate, requireRole("vendor"), vendorController.getMine);
router.post("/me/time-off", authenticate, requireRole("vendor"), vendorController.addTimeOff);
router.delete("/me/time-off/:entryId", authenticate, requireRole("vendor"), vendorController.removeTimeOff);
router.post("/", authenticate, requireRole("vendor"), requireVerifiedEmail, vendorController.create);
router.get("/:id", vendorController.getOne);
router.patch("/:id", authenticate, vendorController.update);
router.post("/:id/verify", authenticate, requireRole("admin"), vendorController.verify);
router.post("/:id/request-changes", authenticate, requireRole("admin"), vendorController.requestChanges);

module.exports = router;
