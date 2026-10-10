const cron = require("node-cron");
const Booking = require("../models/Booking");
const paymentService = require("../services/paymentService");
const bookingService = require("../services/bookingService");
const trustService = require("../services/trustService");

// Architecture.md §7 step 3: "a scheduled job captures the payment and
// marks it released" once a booking has been completed for at least this
// many hours with no dispute raised. A booking that's since moved to
// "disputed" no longer matches status: "completed" below, so it's
// naturally excluded — no separate dispute check needed.
const GRACE_HOURS = Number(process.env.PAYMENT_RELEASE_GRACE_HOURS || 24);

// Design.md §3.1 "Mark as completed (or auto-completes)": a customer who
// never responds to delivered work would otherwise leave the booking in
// "submitted" forever and the vendor unpaid.
const AUTO_COMPLETE_DAYS = Number(process.env.AUTO_COMPLETE_DAYS || 3);

const latestEntry = (booking, status) => [...booking.statusHistory].reverse().find((h) => h.status === status);

async function releaseEligiblePayments() {
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);
  const candidates = await Booking.find({ status: "completed", paymentId: { $ne: null } }).populate("paymentId", "status");

  for (const booking of candidates) {
    // Already released or refunded: nothing to do. Without this, every
    // past booking logged a "Cannot release" error on every hourly run.
    if (booking.paymentId?.status !== "held") continue;
    const completedEntry = latestEntry(booking, "completed");
    if (!completedEntry || completedEntry.changedAt > cutoff) continue;

    try {
      await paymentService.releasePayment(booking._id);
      console.log(`Auto-released payment for booking ${booking._id}`);
    } catch (err) {
      // A transient Stripe error — log and move on; the next run retries
      // automatically since this query re-evaluates every time.
      console.error(`Auto-release failed for booking ${booking._id}:`, err.message);
    }
  }
}

async function autoCompleteStaleDeliveries() {
  const cutoff = new Date(Date.now() - AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await Booking.find({ status: "submitted" });

  for (const booking of candidates) {
    // The latest delivery, not the first: a revision restarts the clock.
    const delivered = latestEntry(booking, "submitted");
    if (!delivered || delivered.changedAt > cutoff) continue;

    try {
      // Acting as the customer keeps this on the one state-machine path
      // (history, event message, vendor notification) with no special
      // "system" role to secure; the note makes the record honest about
      // who actually decided. The payment then follows the normal 24h
      // release above, so the customer can still dispute in that window.
      await bookingService.updateBookingStatus(
        booking._id,
        { id: String(booking.customerId), role: "customer" },
        "completed",
        { note: `Auto-accepted — no response within ${AUTO_COMPLETE_DAYS} days of delivery` }
      );
      console.log(`Auto-completed booking ${booking._id}`);
    } catch (err) {
      console.error(`Auto-complete failed for booking ${booking._id}:`, err.message);
    }
  }
}

function startPaymentReleaseJob() {
  // Hourly is frequent enough for a 24h-scale grace period without
  // hammering Stripe; adjust alongside PAYMENT_RELEASE_GRACE_HOURS if
  // that's tuned much shorter for a demo.
  cron.schedule("0 * * * *", async () => {
    await autoCompleteStaleDeliveries().catch((err) => console.error("Auto-complete job crashed:", err));
    await releaseEligiblePayments().catch((err) => console.error("Payment release job crashed:", err));
  });
  // Nightly: refresh every trust score (response rates drift as requests age).
  cron.schedule("30 3 * * *", () => {
    trustService.recomputeAll().catch((err) => console.error("Trust score job crashed:", err));
  });
}

module.exports = { startPaymentReleaseJob, releaseEligiblePayments, autoCompleteStaleDeliveries, AUTO_COMPLETE_DAYS };
