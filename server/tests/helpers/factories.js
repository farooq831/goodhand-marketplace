import bcrypt from "bcryptjs";

import { createRequire } from "node:module";

// Load models through Node's CommonJS loader — the same one the services
// use via require(). Importing them as ESM would give Vitest its own copy
// of each file, and Mongoose refuses to compile a model name twice
// (OverwriteModelError).
const require = createRequire(import.meta.url);
export const User = require("../../src/models/User.js");
export const VendorProfile = require("../../src/models/VendorProfile.js");
export const Listing = require("../../src/models/Listing.js");
export const Booking = require("../../src/models/Booking.js");
export const Payment = require("../../src/models/Payment.js");

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

export async function makeUser(overrides = {}) {
  return User.create({
    name: overrides.name || "Test User",
    email: overrides.email || `user-${uniq()}@example.com`,
    passwordHash: await bcrypt.hash(overrides.password || "Password1234", 4),
    role: overrides.role || "customer",
    emailVerified: true,
    ...overrides,
  });
}

/** A verified vendor: the User plus the VendorProfile that listings hang off. */
export async function makeVendor(overrides = {}) {
  const user = await makeUser({ role: "vendor", name: "Test Vendor" });
  const profile = await VendorProfile.create({
    userId: user._id,
    businessName: overrides.businessName || `Vendor ${uniq()}`,
    category: overrides.category || "Tutoring",
    description: overrides.description || "A test vendor.",
    isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true,
    serviceArea: { city: "Lahore", location: { type: "Point", coordinates: [74.35, 31.52] } },
    ...overrides,
  });
  return { user, profile };
}

export async function makeListing(vendorProfile, overrides = {}) {
  return Listing.create({
    vendorId: vendorProfile._id,
    title: overrides.title || "Test Listing",
    description: overrides.description || "A test listing.",
    category: overrides.category || "Tutoring",
    price: overrides.price ?? 50,
    durationMinutes: overrides.durationMinutes ?? 60,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    availabilityRules: overrides.availabilityRules || {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: "09:00",
      endTime: "17:00",
    },
    photos: [],
  });
}

/**
 * A booking written straight to the collection, bypassing the service, so a
 * test can set up an arbitrary starting state (including states the service
 * would refuse to produce) without fighting the state machine.
 */
export async function makeBooking({ listing, customer, vendorProfile, status = "pending", startTime = "10:00", endTime = "11:00", date, price, paymentId = null }) {
  return Booking.create({
    listingId: listing._id,
    customerId: customer._id,
    vendorId: vendorProfile._id,
    slot: { date: date || nextSlotDate(), startTime, endTime },
    price: price ?? listing.price,
    status,
    paymentId,
    statusHistory: [{ status: "pending", changedAt: new Date(), changedBy: customer._id }],
  });
}

export async function makePayment(booking, overrides = {}) {
  return Payment.create({
    bookingId: booking._id,
    amount: overrides.amount ?? booking.price,
    commissionAmount: overrides.commissionAmount ?? booking.price * 0.1,
    status: overrides.status || "held",
    stripePaymentIntentId: overrides.stripePaymentIntentId || `pi_test_${uniq()}`,
    ...overrides,
  });
}

/** A fixed future date at UTC midnight — matches how createBooking stores slots. */
export function nextSlotDate(daysAhead = 7) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d;
}

/** The shape `req.user` has after the authenticate middleware runs. */
export function requesterFor(user) {
  return { id: String(user._id), role: user.role };
}

const mongoose = require("mongoose");
export const newObjectId = () => new mongoose.Types.ObjectId();
