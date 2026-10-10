import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Booking, Payment, makeUser, makeVendor, makeListing, makeBooking, makePayment, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);

const paymentService = require("../src/services/paymentService.js");
const bookingService = require("../src/services/bookingService.js");
const { releaseEligiblePayments: runRelease, backfillReleaseAfter, autoCompleteStaleDeliveries } = require("../src/jobs/releasePayments.js");
// Fixtures are written straight to the DB (no state machine), so derive
// releaseAfter the way the startup migration does before each run.
const releaseEligiblePayments = async () => { await backfillReleaseAfter(); return runRelease(); };
const Notification = require("../src/models/Notification.js");

async function setup(status = "pending") {
  const customer = await makeUser();
  const { user: vendorUser, profile } = await makeVendor();
  const listing = await makeListing(profile, { price: 200 });
  const booking = await makeBooking({ listing, customer, vendorProfile: profile, status });
  return { booking, customer, vendorUser, customerReq: requesterFor(customer), vendorReq: requesterFor(vendorUser) };
}

// PRD §8: "Payment escrow state machine correctly transitions in all cases
// (completed, cancelled, disputed)". These run without a Stripe key — the
// demo checkout path must still move money through held → released/refunded.
describe("demo escrow (no Stripe account)", () => {
  it("confirmPayment holds the funds, links the booking, takes commission, and notifies the customer", async () => {
    const { booking, customer } = await setup();
    const { payment } = await paymentService.confirmPayment(customer._id, booking._id);

    expect(payment.status).toBe("held");
    expect(payment.amount).toBe(200);
    expect(payment.commissionAmount).toBe(20); // PLATFORM_COMMISSION_PERCENT=10 in tests/setup.js
    expect(String((await Booking.findById(booking._id)).paymentId)).toBe(String(payment._id));
    expect(await Notification.countDocuments({ userId: customer._id, type: "payment_confirmed" })).toBe(1);
  });

  it("refuses a second payment for the same booking and payments for someone else's booking", async () => {
    const { booking, customer } = await setup();
    await paymentService.confirmPayment(customer._id, booking._id);
    await expect(paymentService.confirmPayment(customer._id, booking._id)).rejects.toMatchObject({ statusCode: 409 });

    const other = await setup();
    await expect(paymentService.confirmPayment(customer._id, other.booking._id)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("releases a demo payment without calling Stripe", async () => {
    const { booking, vendorUser } = await setup("completed");
    const payment = await makePayment(booking, { stripePaymentIntentId: `demo_${booking._id}_1` });
    await Booking.updateOne({ _id: booking._id }, { paymentId: payment._id });

    const released = await paymentService.releasePayment(booking._id);
    expect(released.status).toBe("released");
    expect(released.releasedAt).toBeInstanceOf(Date);
    expect(await Notification.countDocuments({ userId: vendorUser._id, type: "payment_released" })).toBe(1);
  });

  it("refunds the held payment when a vendor declines or either side cancels", async () => {
    for (const [from, who, to] of [["pending", "vendorReq", "declined"], ["pending", "customerReq", "cancelled"], ["accepted", "vendorReq", "cancelled"]]) {
      const ctx = await setup(from);
      const payment = await makePayment(ctx.booking, { stripePaymentIntentId: `demo_${ctx.booking._id}_1` });
      await Booking.updateOne({ _id: ctx.booking._id }, { paymentId: payment._id });

      await bookingService.updateBookingStatus(ctx.booking._id, ctx[who], to);
      expect((await Payment.findById(payment._id)).status, `${from} -> ${to}`).toBe("refunded");
    }
  });

  it("leaves a real Stripe payment untouched when Stripe is unreachable", async () => {
    const { booking } = await setup("completed");
    const payment = await makePayment(booking, { stripePaymentIntentId: "pi_real_intent" });
    await Booking.updateOne({ _id: booking._id }, { paymentId: payment._id });

    await expect(paymentService.releasePayment(booking._id)).rejects.toMatchObject({ statusCode: 503 });
    expect((await Payment.findById(payment._id)).status).toBe("held");
  });

  it("will not release or refund a payment that isn't held", async () => {
    const { booking } = await setup("completed");
    await makePayment(booking, { status: "released", stripePaymentIntentId: `demo_${booking._id}_1` });
    await expect(paymentService.releasePayment(booking._id)).rejects.toMatchObject({ statusCode: 400 });
    await expect(paymentService.refundPayment(booking._id)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("auto-release job", () => {
  async function completedBooking(hoursAgo, status = "completed") {
    const ctx = await setup(status);
    const payment = await makePayment(ctx.booking, { stripePaymentIntentId: `demo_${ctx.booking._id}_1` });
    await Booking.updateOne(
      { _id: ctx.booking._id },
      {
        paymentId: payment._id,
        $push: { statusHistory: { status: "completed", changedAt: new Date(Date.now() - hoursAgo * 3600 * 1000), changedBy: ctx.customer._id } },
      }
    );
    return payment;
  }

  it("releases only completed bookings past the grace period, skipping recent and disputed ones", async () => {
    const old = await completedBooking(48);
    const recent = await completedBooking(1);
    const disputed = await completedBooking(48, "disputed");

    await releaseEligiblePayments();

    expect((await Payment.findById(old._id)).status).toBe("released");
    expect((await Payment.findById(recent._id)).status).toBe("held");
    expect((await Payment.findById(disputed._id)).status).toBe("held");
  });
});

describe("auto-complete job (Design.md §3.1 'or auto-completes')", () => {
  async function delivered(daysAgo, { revisedDaysAgo } = {}) {
    const ctx = await setup("submitted");
    const at = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);
    const history = [{ status: "accepted", changedAt: at(daysAgo + 1), changedBy: ctx.vendorUser._id }, { status: "submitted", changedAt: at(daysAgo), changedBy: ctx.vendorUser._id, files: ["https://example.com/a.pdf"] }];
    if (revisedDaysAgo != null) {
      history.push({ status: "accepted", changedAt: at(revisedDaysAgo + 0.5), changedBy: ctx.customer._id, note: "fix" });
      history.push({ status: "submitted", changedAt: at(revisedDaysAgo), changedBy: ctx.vendorUser._id, files: ["https://example.com/b.pdf"] });
    }
    await Booking.updateOne({ _id: ctx.booking._id }, { $push: { statusHistory: { $each: history } } });
    return ctx;
  }

  it("completes deliveries left unanswered past the window, on the customer's behalf with an explanatory note", async () => {
    const stale = await delivered(5);
    const fresh = await delivered(1);

    await autoCompleteStaleDeliveries();

    const after = await Booking.findById(stale.booking._id);
    expect(after.status).toBe("completed");
    const entry = after.statusHistory.at(-1);
    expect(String(entry.changedBy)).toBe(String(stale.customer._id));
    expect(entry.note).toMatch(/Auto-accepted/);
    expect(await Notification.countDocuments({ userId: stale.vendorUser._id, type: "booking_completed" })).toBe(1);
    expect((await Booking.findById(fresh.booking._id)).status).toBe("submitted");
  });

  it("restarts the clock on a revised delivery", async () => {
    const revised = await delivered(10, { revisedDaysAgo: 1 });
    await autoCompleteStaleDeliveries();
    expect((await Booking.findById(revised.booking._id)).status).toBe("submitted");
  });

  it("then lets the normal 24h release pay the vendor", async () => {
    const stale = await delivered(5);
    const payment = await makePayment(stale.booking, { stripePaymentIntentId: `demo_${stale.booking._id}_1` });
    await Booking.updateOne({ _id: stale.booking._id }, { paymentId: payment._id });

    await autoCompleteStaleDeliveries();
    await releaseEligiblePayments();
    // Just completed, so still inside the dispute window.
    expect((await Payment.findById(payment._id)).status).toBe("held");
  });
});

describe("release job housekeeping", () => {
  it("skips completed bookings whose payment is no longer held (no hourly error spam)", async () => {
    const ctx = await setup("completed");
    const payment = await makePayment(ctx.booking, { status: "released", stripePaymentIntentId: `demo_${ctx.booking._id}_1` });
    await Booking.updateOne({ _id: ctx.booking._id }, { paymentId: payment._id, $push: { statusHistory: { status: "completed", changedAt: new Date(Date.now() - 48 * 3600 * 1000), changedBy: ctx.customer._id } } });

    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    try { await releaseEligiblePayments(); } finally { console.error = original; }
    expect(errors.filter((e) => e.includes("Auto-release failed"))).toHaveLength(0);
  });
});

describe("escrow timing (releaseAfter) and migrations", () => {
  const jobs = require("../src/jobs/releasePayments.js");

  it("completing starts the countdown, a dispute stops it, and only due payments are released", async () => {
    const ctx = await setup("submitted");
    const payment = await makePayment(ctx.booking, { stripePaymentIntentId: `demo_${ctx.booking._id}_x` });
    await Booking.updateOne({ _id: ctx.booking._id }, { paymentId: payment._id });

    await bookingService.updateBookingStatus(ctx.booking._id, ctx.customerReq, "completed");
    const afterComplete = await Payment.findById(payment._id);
    expect(afterComplete.releaseAfter.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    expect(await jobs.releaseEligiblePayments()).toBe(0); // not due yet

    await bookingService.updateBookingStatus(ctx.booking._id, ctx.customerReq, "disputed", { note: "Missing pages" });
    expect((await Payment.findById(payment._id)).releaseAfter).toBeNull();
    expect(await jobs.releaseEligiblePayments(new Date(Date.now() + 48 * 3600 * 1000))).toBe(0); // disputed: never auto-released
  });

  it("vendor backfill visits each payment once, even when its booking is gone", async () => {
    const ctx = await setup("completed");
    const good = await makePayment(ctx.booking, { vendorId: null, stripePaymentIntentId: `demo_${ctx.booking._id}_g` });
    await Payment.create({ bookingId: new (require("mongoose").Types.ObjectId)(), amount: 10, commissionAmount: 1, status: "held", stripePaymentIntentId: "demo_orphan" });
    await expect(jobs.backfillPaymentVendors()).resolves.toBe(1);
    expect(String((await Payment.findById(good._id)).vendorId)).toBe(String(ctx.booking.vendorId));
  });
});
