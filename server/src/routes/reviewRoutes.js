const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const reviewController = require("../controllers/reviewController");

const router = express.Router();
router.get("/vendor/:vendorId", reviewController.getForVendor);
router.get("/customer/:customerId", reviewController.getForCustomer);
router.post("/", authenticate, requireRole("customer", "vendor"), reviewController.create);
router.post("/:id/response", authenticate, requireRole("vendor"), reviewController.respond);

module.exports = router;
