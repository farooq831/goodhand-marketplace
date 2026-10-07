const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const vendorController = require("../controllers/vendorController");

const router = express.Router();

// /me before /:id so Express doesn't treat "me" as an id param.
router.get("/me", authenticate, requireRole("vendor"), vendorController.getMine);
router.post("/", authenticate, requireRole("vendor"), vendorController.create);
router.get("/:id", vendorController.getOne);
router.patch("/:id", authenticate, vendorController.update);
router.post("/:id/verify", authenticate, requireRole("admin"), vendorController.verify);
router.post("/:id/request-changes", authenticate, requireRole("admin"), vendorController.requestChanges);

module.exports = router;
