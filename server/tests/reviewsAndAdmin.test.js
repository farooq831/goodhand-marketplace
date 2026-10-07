import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Booking, Payment, User, VendorProfile, makeUser, makeVendor, makeListing, makeBooking, makePayment, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);

const reviewService = require("../src/services/reviewService.js");
const adminService = require("../src/services/adminService.js");

async function setup(status) {
  const customer = await makeUser();
  const { user: vendorUser, profile } = await makeVendor();
  const listing = await makeListing(profile, { price: 100 });
  const booking = await makeBooking({ listing, customer, vendorProfile: profile, status });
  return { booking, customer, vendorUser, profile, listing };
}

describe("reviews (PRD §5.7)", () => {
  it("only a completed booking can be reviewed", async () => {
    const { booking, customer } = await setup("accepted");
    await expect(reviewService.createReview(customer._id, { bookingId: booking._id, rating: 5, comment: "Great" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("one customer review per booking, and the vendor's denormalized rating stays in sync", async () => {
    const first = await setup("completed");
    await reviewService.createReview(first.customer._id, { bookingId: first.booking._id, rating: 5, comment: "Excellent" });
    await expect(reviewService.createReview(first.customer._id, { bookingId: first.booking._id, rating: 1, comment: "Changed my mind" })).rejects.toMatchObject({ statusCode: 409 });

    // A second completed booking with the same vendor.
    const customer2 = await makeUser();
    const booking2 = await makeBooking({ listing: first.listing, customer: customer2, vendorProfile: first.profile, status: "completed" });
    await reviewService.createReview(customer2._id, { bookingId: booking2._id, rating: 2, comment: "Late" });

    const vendor = await VendorProfile.findById(first.profile._id);
    expect(vendor.reviewCount).toBe(2);
    expect(vendor.avgRating).toBe(3.5);
  });

  it("a stranger can't review someone else's booking", async () => {
    const { booking } = await setup("completed");
    const stranger = await makeUser();
    await expect(reviewService.createReview(stranger._id, { bookingId: booking._id, rating: 5, comment: "Hi" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("the vendor can respond to a review exactly once", async () => {
    const { booking, customer, vendorUser } = await setup("completed");
    const review = await reviewService.createReview(customer._id, { bookingId: booking._id, rating: 3, comment: "OK" });
    await reviewService.respondToReview(review._id, vendorUser._id, "Thanks for the feedback");
    await expect(reviewService.respondToReview(review._id, vendorUser._id, "Again")).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("admin dispute resolution (PRD §8: admin can resolve a simulated dispute)", () => {
  async function disputed() {
    const ctx = await setup("disputed");
    const payment = await makePayment(ctx.booking, { stripePaymentIntentId: `demo_${ctx.booking._id}_1` });
    await Booking.updateOne({ _id: ctx.booking._id }, { paymentId: payment._id });
    const admin = requesterFor(await makeUser({ role: "admin" }));
    return { ...ctx, payment, admin };
  }

  it("requires a resolution note", async () => {
    const { booking, admin } = await disputed();
    await expect(adminService.resolveDispute(booking._id, admin, "release", "")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("release → booking completed, payment released, queue emptied", async () => {
    const { booking, payment, admin } = await disputed();
    await adminService.resolveDispute(booking._id, admin, "release", "Work was delivered as agreed");

    expect((await Booking.findById(booking._id)).status).toBe("completed");
    expect((await Payment.findById(payment._id)).status).toBe("released");
    expect(await adminService.getDisputes()).toHaveLength(0);
  });

  it("refund → booking cancelled, payment refunded", async () => {
    const { booking, payment, admin } = await disputed();
    await adminService.resolveDispute(booking._id, admin, "refund", "Vendor did not show up");

    const after = await Booking.findById(booking._id);
    expect(after.status).toBe("cancelled");
    expect(after.statusHistory.at(-1).note).toBe("Vendor did not show up");
    expect((await Payment.findById(payment._id)).status).toBe("refunded");
  });

  it("analytics counts escrow, releases, commission, and in-flight bookings in GMV", async () => {
    const a = await disputed();
    await adminService.resolveDispute(a.booking._id, a.admin, "release", "Fine");
    const b = await setup("submitted");
    await makePayment(b.booking, { stripePaymentIntentId: `demo_${b.booking._id}_1` });

    const stats = await adminService.getAnalytics();
    expect(stats.gmv).toBe(200); // completed + submitted, 100 each
    expect(stats.released).toBe(100);
    expect(stats.escrowHeld).toBe(100);
    expect(stats.commissionEarned).toBe(10);
    expect(stats.bookingsByStatus).toMatchObject({ completed: 1, submitted: 1 });
    expect(stats.recentTransactions).toHaveLength(2);
  });
});

describe("vendor verification review", () => {
  const vendorService = require("../src/services/vendorService.js");
  const NotificationModel = require("../src/models/Notification.js");

  async function applicant() {
    const { user, profile } = await makeVendor({ isVerified: false });
    await VendorProfile.updateOne({ _id: profile._id }, { verificationStatus: "pending", reviewHistory: [{ action: "submitted", by: user._id }] });
    const admin = requesterFor(await makeUser({ role: "admin" }));
    return { user, profile, admin, owner: requesterFor(user) };
  }

  it("public profile never exposes CNIC, documents or the review trail", async () => {
    const { profile, owner } = await applicant();
    await vendorService.updateProfile(profile._id, owner, { cnicNumber: "3520212345671", documents: [{ type: "cnic_front", url: "https://example.com/front.png" }] });
    const pub = await vendorService.getById(profile._id);
    for (const field of ["cnicNumber", "documents", "verificationDocs", "reviewHistory", "verificationStatus"]) expect(pub).not.toHaveProperty(field);
  });

  it("normalizes a CNIC and rejects a malformed one", async () => {
    const { profile, owner } = await applicant();
    const saved = await vendorService.updateProfile(profile._id, owner, { cnicNumber: "3520212345671" });
    expect(saved.cnicNumber).toBe("35202-1234567-1");
    await expect(vendorService.updateProfile(profile._id, owner, { cnicNumber: "123" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("request changes → vendor notified with readable items → vendor saves → back in the queue as resubmitted", async () => {
    const { user, profile, admin, owner } = await applicant();

    await expect(vendorService.requestChanges(profile._id, admin, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(vendorService.requestChanges(profile._id, admin, { items: ["nonsense"] })).rejects.toMatchObject({ statusCode: 400 });

    const requested = await vendorService.requestChanges(profile._id, admin, { items: ["cnic_back", "cnic_number"], note: "Back photo missing" });
    expect(requested.verificationStatus).toBe("changes_requested");
    const notification = await NotificationModel.findOne({ userId: user._id, type: "vendor_changes_requested" });
    expect(notification.payload.items).toEqual([vendorService.CHANGE_ITEMS.cnic_back, vendorService.CHANGE_ITEMS.cnic_number]);
    expect(notification.payload.note).toBe("Back photo missing");

    const resubmitted = await vendorService.updateProfile(profile._id, owner, { cnicNumber: "35202-1234567-1", resubmitNote: "Added it" });
    expect(resubmitted.verificationStatus).toBe("pending");
    expect(resubmitted.reviewHistory.map((h) => h.action)).toEqual(["submitted", "changes_requested", "resubmitted"]);
    const queue = await vendorService.getVerificationQueue();
    expect(queue.map((v) => String(v._id))).toContain(String(profile._id));
  });

  it("approve verifies both copies of isVerified, leaves the queue, and notifies the vendor", async () => {
    const { user, profile, admin } = await applicant();
    await vendorService.verifyVendor(profile._id, admin, "Looks good");
    expect((await VendorProfile.findById(profile._id)).isVerified).toBe(true);
    expect((await User.findById(user._id)).isVerified).toBe(true);
    expect(await vendorService.getVerificationQueue()).toHaveLength(0);
    expect(await NotificationModel.countDocuments({ userId: user._id, type: "vendor_approved" })).toBe(1);
    await expect(vendorService.verifyVendor(profile._id, admin)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("requesting changes on a live vendor takes them out of search until they comply", async () => {
    const { user, profile, admin } = await applicant();
    await vendorService.verifyVendor(profile._id, admin);
    await vendorService.requestChanges(profile._id, admin, { items: ["description"] });
    expect((await VendorProfile.findById(profile._id)).isVerified).toBe(false);
    expect((await User.findById(user._id)).isVerified).toBe(false);
  });
});
