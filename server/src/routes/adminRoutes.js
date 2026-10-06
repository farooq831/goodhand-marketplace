const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const adminController = require("../controllers/adminController");

const router = express.Router();

router.use(authenticate, requireRole("admin"));
router.get("/vendors/pending", adminController.getPendingVendors);
router.get("/disputes", adminController.getDisputes);
router.patch("/disputes/:id", adminController.resolveDispute);
router.get("/analytics", adminController.getAnalytics);
router.patch("/users/:id/status", adminController.setUserStatus);
router.get("/users", adminController.getUsers);

module.exports = router;
