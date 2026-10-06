const express = require("express");
const authenticate = require("../middleware/auth");
const requireRole = require("../middleware/roleGuard");
const paymentController = require("../controllers/paymentController");

const router = express.Router();

// /webhook is NOT here — it needs a raw (unparsed) body for Stripe's
// signature check, so it's mounted directly in server.js ahead of
// express.json(), before this router (which needs JSON parsing) applies.

router.post("/create-intent", authenticate, requireRole("customer"), paymentController.createIntent);
router.post("/confirm", authenticate, requireRole("customer"), paymentController.confirm);

// Architecture.md §7 step 4: admin resolves a dispute by releasing to the
// vendor or refunding the customer. (The automatic release path is
// jobs/releasePayments.js, not this endpoint.)
router.post("/:bookingId/release", authenticate, requireRole("admin"), paymentController.release);
router.post("/:bookingId/refund", authenticate, requireRole("admin"), paymentController.refund);

// Not in Architecture.md's literal endpoint list — added so the booking
// detail page can show a payment status badge (same pattern as the
// pragmatic /mine-style additions in earlier phases).
router.get("/booking/:bookingId", authenticate, paymentController.getForBooking);

module.exports = router;
