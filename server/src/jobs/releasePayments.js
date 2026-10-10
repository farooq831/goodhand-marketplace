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

const Payment = require("../models/Payment");
const RELEASE_BATCH = 500;

// Reads only payments whose release time has passed (index on status +
// releaseAfter). It used to load every completed booking ever made on
// every run, which gets slower forever as the platform grows.
async function releaseEligiblePayments(now = new Date()) {
  const due = await Payment.find({ status: "held", releaseAfter: { $ne: null, $lte: now } }).select("bookingId").limit(RELEASE_BATCH).lean();
  for (const { bookingId } of due) {
    // Defensive: never release a booking that isn't completed (e.g. a
    // dispute opened between setting releaseAfter and now).
    const booking = await Booking.findById(bookingId).select("status");
    if (booking?.status !== "completed") {
      await Payment.updateOne({ bookingId, status: "held" }, { releaseAfter: null });
      continue;
    }
    try {
      await paymentService.releasePayment(bookingId);
      console.log(`Auto-released payment for booking ${bookingId}`);
    } catch (err) {
      // A transient Stripe error — the payment stays held with its
      // releaseAfter, so the next run retries automatically.
      console.error(`Auto-release failed for booking ${bookingId}:`, err.message);
    }
  }
  return due.length;
}

// One-off migration: payments created before Payment.vendorId existed.
async function backfillPaymentVendors() {
  // Walks forward by _id so a payment whose booking no longer exists (which
  // stays null) is visited once, never re-fetched in an endless loop.
  let fixed = 0;
  let lastId = null;
  for (;;) {
    const batch = await Payment.find({ vendorId: null, ...(lastId ? { _id: { $gt: lastId } } : {}) }).sort({ _id: 1 }).select("bookingId").limit(500).lean();
    if (!batch.length) return fixed;
    lastId = batch[batch.length - 1]._id;
    const bookings = await Booking.find({ _id: { $in: batch.map((p) => p.bookingId) } }).select("vendorId").lean();
    const vendorOf = new Map(bookings.map((b) => [String(b._id), b.vendorId]));
    const ops = batch
      .filter((p) => vendorOf.get(String(p.bookingId)))
      .map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { vendorId: vendorOf.get(String(p.bookingId)) } } } }));
    if (ops.length) await Payment.bulkWrite(ops);
    fixed += ops.length;
  }
}

// One-off migration for bookings completed before releaseAfter existed:
// derive it from the completion time in statusHistory. Bounded by
// in-flight (held) payments only.
async function backfillReleaseAfter() {
  const held = await Payment.find({ status: "held", releaseAfter: null }).select("bookingId").lean();
  if (!held.length) return 0;
  const completed = await Booking.find({ _id: { $in: held.map((p) => p.bookingId) }, status: "completed" }).select("statusHistory");
  for (const booking of completed) {
    const entry = latestEntry(booking, "completed");
    const at = entry ? new Date(entry.changedAt).getTime() : Date.now();
    await Payment.updateOne({ bookingId: booking._id, status: "held", releaseAfter: null }, { releaseAfter: new Date(at + GRACE_HOURS * 60 * 60 * 1000) });
  }
  return completed.length;
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
  // Every 10 minutes: cancel checkouts abandoned before payment.
  cron.schedule("*/10 * * * *", () => {
    bookingService.expireUnpaidBookings().catch((err) => console.error("Unpaid-booking expiry failed:", err.message));
  });
  // Every 10 minutes: expired featured placements stop ranking first. The
  // recommended sort orders by featuredUntil, so expiry must clear it.
  cron.schedule("*/10 * * * *", () => {
    require("../models/Listing").updateMany({ featuredUntil: { $lte: new Date() } }, { $set: { featuredUntil: null } }).catch((err) => console.error("Featured cleanup failed:", err.message));
  });
  // Nightly: refresh every trust score (response rates drift as requests age).
  cron.schedule("30 3 * * *", () => {
    trustService.recomputeAll().catch((err) => console.error("Trust score job crashed:", err));
  });
}

module.exports = { startPaymentReleaseJob, releaseEligiblePayments, backfillReleaseAfter, backfillPaymentVendors, autoCompleteStaleDeliveries, AUTO_COMPLETE_DAYS };
