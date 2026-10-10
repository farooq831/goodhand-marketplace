import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Booking, Payment, makeUser, makeVendor, makeListing, makeBooking, makePayment, requesterFor, nextSlotDate } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const bookingService = require("../src/services/bookingService.js");
const paymentService = require("../src/services/paymentService.js");
const Notification = require("../src/models/Notification.js");

// Each test fires competing operations at the same instant and asserts the
// invariant holds: exactly one wins, the rest fail cleanly.
const settle = (promises) => Promise.allSettled(promises).then((r) => ({ ok: r.filter((x) => x.status === "fulfilled"), failed: r.filter((x) => x.status === "rejected") }));

describe("race conditions", () => {
  it("two overlapping requests accepted at once → exactly one accepted (no double-booking)", async () => {
    const { user: vendorUser, profile } = await makeVendor();
    const listing = await makeListing(profile);
    const date = nextSlotDate(9);
    const requests = await Promise.all(
      Array.from({ length: 5 }, async () => makeBooking({ listing, customer: await makeUser(), vendorProfile: profile, date, startTime: "10:00", endTime: "11:00" }))
    );
    const { ok, failed } = await settle(requests.map((b) => bookingService.updateBookingStatus(b._id, requesterFor(vendorUser), "accepted")));
    expect(ok).toHaveLength(1);
    expect(failed.every((f) => f.reason.statusCode === 409)).toBe(true);
    expect(await Booking.countDocuments({ vendorId: profile._id, status: "accepted" })).toBe(1);
  });

  it("customer cancels while vendor accepts → one wins, the other is told to refresh", async () => {
    const { user: vendorUser, profile } = await makeVendor();
    const listing = await makeListing(profile);
    const customer = await makeUser();
    const booking = await makeBooking({ listing, customer, vendorProfile: profile });
    const { ok, failed } = await settle([
      bookingService.updateBookingStatus(booking._id, requesterFor(vendorUser), "accepted"),
      bookingService.updateBookingStatus(booking._id, requesterFor(customer), "cancelled"),
    ]);
    expect(ok).toHaveLength(1);
    expect(failed[0].reason.statusCode).toBe(409);
    const after = await Booking.findById(booking._id);
    expect(after.statusHistory).toHaveLength(2); // pending + exactly one transition
  });

  it("double-clicked payment → one escrow payment", async () => {
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    const customer = await makeUser();
    const booking = await makeBooking({ listing, customer, vendorProfile: profile });
    await Payment.init(); // make sure the unique index exists before racing
    const { ok, failed } = await settle(Array.from({ length: 4 }, () => paymentService.confirmPayment(customer._id, booking._id)));
    expect(ok).toHaveLength(1);
    expect(failed.every((f) => f.reason.statusCode === 409)).toBe(true);
    expect(await Payment.countDocuments({ bookingId: booking._id })).toBe(1);
  });

  it("release job and admin release at once → money moves once, vendor notified once", async () => {
    const { user: vendorUser, profile } = await makeVendor();
    const listing = await makeListing(profile);
    const booking = await makeBooking({ listing, customer: await makeUser(), vendorProfile: profile, status: "completed" });
    await makePayment(booking, { stripePaymentIntentId: `demo_${booking._id}_1` });
    const { ok } = await settle(Array.from({ length: 4 }, () => paymentService.releasePayment(booking._id)));
    expect(ok).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: vendorUser._id, type: "payment_released" })).toBe(1);
  });

  it("release racing a refund → exactly one outcome", async () => {
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    const booking = await makeBooking({ listing, customer: await makeUser(), vendorProfile: profile, status: "disputed" });
    await makePayment(booking, { stripePaymentIntentId: `demo_${booking._id}_1` });
    const { ok } = await settle([paymentService.releasePayment(booking._id), paymentService.refundPayment(booking._id)]);
    expect(ok).toHaveLength(1);
    expect(["released", "refunded"]).toContain((await Payment.findOne({ bookingId: booking._id })).status);
  });
});
