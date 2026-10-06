const paymentService = require("../services/paymentService");

async function createIntent(req, res, next) {
  try {
    const result = await paymentService.createPaymentIntent(req.user.id, req.body.bookingId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function confirm(req, res, next) {
  try {
    const result = await paymentService.confirmPayment(req.user.id, req.body.bookingId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function release(req, res, next) {
  try {
    const payment = await paymentService.releasePayment(req.params.bookingId);
    res.json({ payment });
  } catch (err) {
    next(err);
  }
}

async function refund(req, res, next) {
  try {
    const payment = await paymentService.refundPayment(req.params.bookingId);
    res.json({ payment });
  } catch (err) {
    next(err);
  }
}

async function getForBooking(req, res, next) {
  try {
    const payment = await paymentService.getPaymentForBooking(req.params.bookingId, req.user);
    res.json({ payment }); // null if the booking hasn't started checkout yet
  } catch (err) {
    next(err);
  }
}

// Mounted directly in server.js ahead of express.json() — Stripe needs
// the raw request body to verify the signature, so req.body here is a
// Buffer, not parsed JSON (see server.js for why).
async function handleWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    event = paymentService.constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await paymentService.handleStripeEvent(event);
  } catch (err) {
    // Log and still acknowledge receipt — a business-logic bug on our
    // side won't fix itself on Stripe's retry, so there's no point
    // making Stripe hammer this endpoint for it.
    console.error("Error processing Stripe webhook event:", event.type, err);
  }

  res.json({ received: true });
}

module.exports = { createIntent, confirm, release, refund, getForBooking, handleWebhook };
