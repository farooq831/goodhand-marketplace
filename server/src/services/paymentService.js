const stripe = require("../config/stripe");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const ApiError = require("../utils/ApiError");
const { resolveBookingRequesterRole } = require("../utils/bookingAccess");
const notificationService = require("./notificationService");

const COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT || 10);
// Demo-scope simplification: booking prices are quoted in Rs (PKR) in the
// UI, but sent to Stripe numerically as-is under a configurable test
// currency (no real FX conversion) — see server/.env.example.
const CURRENCY = process.env.STRIPE_CURRENCY || "usd";

// Architecture.md §7 escrow flow, step 1-2: customer confirms a booking →
// we create a Stripe PaymentIntent with manual capture and, per the doc,
// treat the booking as held once that's underway. This is optimistic —
// Stripe hasn't actually authorized funds until the client attaches a
// payment method and confirms, which is what the webhook below reconciles
// this record against once that happens.
async function createPaymentIntent(customerId, bookingId) {
  if (!bookingId) throw new ApiError(400, "bookingId is required");

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (String(booking.customerId) !== String(customerId)) {
    throw new ApiError(403, "You do not have access to this booking");
  }
  if (booking.status !== "pending") {
    throw new ApiError(400, "Payment can only be started for a pending booking");
  }
  if (booking.paymentId) {
    throw new ApiError(409, "A payment has already been started for this booking");
  }

  const amount = booking.price;
  const commissionAmount = Math.round(amount * (COMMISSION_PERCENT / 100) * 100) / 100;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Stripe expects the smallest currency unit
    currency: CURRENCY,
    capture_method: "manual",
    metadata: { bookingId: String(booking._id) },
  });

  const payment = await Payment.create({
    bookingId: booking._id,
    stripePaymentIntentId: paymentIntent.id,
    amount,
    commissionAmount,
    status: "held",
    heldAt: new Date(),
  });

  booking.paymentId = payment._id;
  await booking.save();

  return { payment, clientSecret: paymentIntent.client_secret };
}

// Demo checkout (no Stripe account): payments created by confirmPayment()
// carry a "demo_" intent id. They walk the same held -> released/refunded
// escrow lifecycle locally, but there is no real PaymentIntent behind them,
// so release/refund must not call Stripe for them — capture() on a fake id
// fails (404 with a key, 503 from the config proxy without one), which used
// to break auto-release, cancellation refunds and dispute resolution.
const DEMO_INTENT_PREFIX = "demo_";
const isDemoPayment = (payment) => String(payment.stripePaymentIntentId || "").startsWith(DEMO_INTENT_PREFIX);

async function confirmPayment(customerId, bookingId) {
  if (!bookingId) throw new ApiError(400, "bookingId is required");
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (String(booking.customerId) !== String(customerId)) throw new ApiError(403, "You do not have access to this booking");
  if (booking.status !== "pending") throw new ApiError(400, "Payment can only be started for a pending booking");
  if (booking.paymentId) throw new ApiError(409, "A payment has already been started for this booking");

  const payment = await Payment.create({
    bookingId: booking._id,
    stripePaymentIntentId: `${DEMO_INTENT_PREFIX}${booking._id}_${Date.now()}`,
    amount: booking.price,
    commissionAmount: Math.round(booking.price * (COMMISSION_PERCENT / 100) * 100) / 100,
    status: "held",
    heldAt: new Date(),
  });
  booking.paymentId = payment._id;
  await booking.save();

  // The Stripe path notifies from the amount_capturable_updated webhook;
  // the demo path has no webhook, so it notifies here (PRD §5.8).
  await notificationService
    .createNotification(customerId, "payment_confirmed", { bookingId: booking._id })
    .catch((err) => console.error("Notification failed:", err.message));

  return { payment };
}

// customerUserId/vendorUserId for notifying the right side of a booking
// about a payment event, without each caller re-deriving it.
async function getBookingParticipants(bookingId) {
  const booking = await Booking.findById(bookingId).populate({ path: "vendorId", select: "userId" });
  if (!booking) return {};
  return { customerUserId: booking.customerId, vendorUserId: booking.vendorId?.userId };
}

// Architecture.md §7 step 3/4: capture (release to vendor) an escrowed
// payment. Called from the admin release endpoint and the auto-release
// cron job (jobs/releasePayments.js).
async function releasePayment(bookingId) {
  const payment = await Payment.findOne({ bookingId });
  if (!payment) throw new ApiError(404, "No payment found for this booking");
  if (payment.status !== "held") {
    throw new ApiError(400, `Cannot release a payment in status "${payment.status}"`);
  }

  if (!isDemoPayment(payment)) await stripe.paymentIntents.capture(payment.stripePaymentIntentId);

  payment.status = "released";
  payment.releasedAt = new Date();
  await payment.save();

  const { vendorUserId } = await getBookingParticipants(payment.bookingId);
  await notificationService
    .createNotification(vendorUserId, "payment_released", { bookingId: payment.bookingId })
    .catch((err) => console.error("Notification failed:", err.message));

  return payment;
}

// Architecture.md §7 step 4: refund (to customer) an escrowed payment
// that hasn't been captured yet. A manual-capture PaymentIntent that's
// still just authorized is voided with cancel() — refunds.create() is
// for a charge that's already been captured, which isn't this case since
// we only ever refund from "held". Called from the admin refund endpoint
// and from updateBookingStatus's cancelled/declined side-effect.
async function refundPayment(bookingId) {
  const payment = await Payment.findOne({ bookingId });
  if (!payment) throw new ApiError(404, "No payment found for this booking");
  if (payment.status !== "held") {
    throw new ApiError(400, `Cannot refund a payment in status "${payment.status}"`);
  }

  if (!isDemoPayment(payment)) await stripe.paymentIntents.cancel(payment.stripePaymentIntentId);

  payment.status = "refunded";
  await payment.save();

  const { customerUserId } = await getBookingParticipants(payment.bookingId);
  await notificationService
    .createNotification(customerUserId, "payment_refunded", { bookingId: payment.bookingId })
    .catch((err) => console.error("Notification failed:", err.message));

  return payment;
}

// For the booking detail page's payment status badge — same visibility
// rule as the booking itself (its customer, its vendor, or an admin).
async function getPaymentForBooking(bookingId, requester) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const { isCustomer, isVendor } = await resolveBookingRequesterRole(booking, requester);
  if (!isCustomer && !isVendor && requester.role !== "admin") {
    throw new ApiError(404, "Booking not found");
  }

  if (!booking.paymentId) return null;
  return Payment.findById(booking.paymentId);
}

function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

// Reconciles our optimistic local state against what Stripe actually did.
// Only a handful of event types matter for the escrow flow; everything
// else is ignored.
async function handleStripeEvent(event) {
  const intent = event.data.object;

  switch (event.type) {
    case "payment_intent.amount_capturable_updated": {
      // Funds actually authorized/held now — confirm the optimistic
      // "held" write from createPaymentIntent with a real timestamp. This
      // has no synchronous counterpart in our own code (unlike released/
      // refunded, which releasePayment/refundPayment already notify on),
      // so the notification lives here.
      const payment = await Payment.findOneAndUpdate(
        { stripePaymentIntentId: intent.id },
        { status: "held", heldAt: new Date() },
        { new: true }
      );
      if (payment) {
        const { customerUserId } = await getBookingParticipants(payment.bookingId);
        await notificationService
          .createNotification(customerUserId, "payment_confirmed", { bookingId: payment.bookingId })
          .catch((err) => console.error("Notification failed:", err.message));
      }
      break;
    }

    case "payment_intent.succeeded":
      // Capture completed — whether triggered by our /release endpoint,
      // the auto-release job, or manually from the Stripe dashboard. The
      // first two already sent "payment_released" synchronously in
      // releasePayment(), so this only needs to keep the record in sync,
      // not notify again.
      await Payment.findOneAndUpdate(
        { stripePaymentIntentId: intent.id },
        { status: "released", releasedAt: new Date() }
      );
      break;

    case "payment_intent.canceled":
      // Same reasoning as above — refundPayment() already notified.
      await Payment.findOneAndUpdate({ stripePaymentIntentId: intent.id }, { status: "refunded" });
      break;

    case "payment_intent.payment_failed": {
      // Authorization never completed — no enum value fits "failed" (see
      // Architecture.md §3's fixed status list), so there's nothing to
      // hold: drop the record and unlink the booking so the customer can
      // retry create-intent.
      const payment = await Payment.findOne({ stripePaymentIntentId: intent.id });
      if (payment) {
        const { customerUserId } = await getBookingParticipants(payment.bookingId);
        await Booking.findByIdAndUpdate(payment.bookingId, { paymentId: null });
        await payment.deleteOne();
        await notificationService
          .createNotification(customerUserId, "payment_failed", { bookingId: payment.bookingId })
          .catch((err) => console.error("Notification failed:", err.message));
      }
      break;
    }

    default:
      break;
  }
}

module.exports = {
  createPaymentIntent,
  confirmPayment,
  releasePayment,
  refundPayment,
  getPaymentForBooking,
  constructWebhookEvent,
  handleStripeEvent,
};
