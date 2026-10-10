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
router.get("/payouts", adminController.getPendingPayouts);
router.get("/payouts/history", adminController.getPayoutHistory);
router.post("/payouts/mark-paid", adminController.markPayoutPaid);
router.get("/audit-log", adminController.getAuditLog);
router.get("/listings", adminController.getListings);
router.patch("/listings/:id/moderation", adminController.moderateListing);
router.get("/security", adminController.getSecurity);

module.exports = router;
