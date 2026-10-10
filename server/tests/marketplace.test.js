import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Listing, VendorProfile, makeUser, makeVendor, makeListing, makeBooking, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const trustService = require("../src/services/trustService.js");
const listingService = require("../src/services/listingService.js");
const savedService = require("../src/services/savedService.js");
const vendorService = require("../src/services/vendorService.js");
const Review = require("../src/models/Review.js");

describe("trust score", () => {
  it("one 5-star review doesn't beat a long, strong track record", () => {
    const newcomer = trustService.scoreFrom({ ratingSum: 5, ratingCount: 1, completed: 1, cancelled: 0, disputed: 0, declined: 0, pending: 0, isVerified: true, documentsComplete: true });
    const veteran = trustService.scoreFrom({ ratingSum: 48 * 4.8, ratingCount: 48, completed: 50, cancelled: 1, disputed: 0, declined: 2, pending: 0, isVerified: true, documentsComplete: true });
    expect(veteran).toBeGreaterThan(newcomer);
  });

  it("disputes and cancellations cost points; result stays within 0-100", () => {
    const clean = trustService.scoreFrom({ ratingSum: 40, ratingCount: 10, completed: 10, cancelled: 0, disputed: 0, declined: 0, pending: 0, isVerified: true, documentsComplete: false });
    const troubled = trustService.scoreFrom({ ratingSum: 40, ratingCount: 10, completed: 10, cancelled: 4, disputed: 4, declined: 0, pending: 0, isVerified: true, documentsComplete: false });
    expect(troubled).toBeLessThan(clean);
    expect(trustService.scoreFrom({ ratingSum: 0, ratingCount: 50, completed: 0, cancelled: 0, disputed: 50, declined: 0, pending: 50, isVerified: false, documentsComplete: false })).toBeGreaterThanOrEqual(0);
  });

  it("is recomputed from real bookings and reviews", async () => {
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    const customer = await makeUser();
    for (let i = 0; i < 3; i++) {
      const b = await makeBooking({ listing, customer, vendorProfile: profile, status: "completed" });
      await Review.create({ bookingId: b._id, customerId: customer._id, vendorId: profile._id, authorRole: "customer", rating: 5, comment: "Great" });
    }
    const score = await trustService.recomputeTrustScore(profile._id);
    expect((await VendorProfile.findById(profile._id)).trustScore).toBe(score);
    expect(score).toBeGreaterThan(60);
  });
});

describe("recommended ranking and featured listings", () => {
  it("featured first, then by trust score", async () => {
    const low = await makeVendor();
    const high = await makeVendor();
    await VendorProfile.updateOne({ _id: low.profile._id }, { trustScore: 40 });
    await VendorProfile.updateOne({ _id: high.profile._id }, { trustScore: 95 });
    const lowListing = await makeListing(low.profile, { title: "Low" });
    const highListing = await makeListing(high.profile, { title: "High" });

    let { listings } = await listingService.searchListings({});
    expect(listings.map((l) => l.title)).toEqual(["High", "Low"]);

    const admin = requesterFor(await makeUser({ role: "admin" }));
    await listingService.moderateListing(admin, lowListing._id, { action: "feature", days: 7 });
    ({ listings } = await listingService.searchListings({ sort: "recommended" }));
    expect(listings.map((l) => l.title)).toEqual(["Low", "High"]);
    await expect(listingService.moderateListing(admin, highListing._id, { action: "feature", days: 3 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("listing moderation", () => {
  it("hidden listings disappear, need a reason, and the vendor can't re-enable them", async () => {
    const { user, profile } = await makeVendor();
    const listing = await makeListing(profile);
    const admin = requesterFor(await makeUser({ role: "admin" }));

    await expect(listingService.moderateListing(admin, listing._id, { action: "hide" })).rejects.toMatchObject({ statusCode: 400 });
    await listingService.moderateListing(admin, listing._id, { action: "hide", reason: "Misleading photos" });
    expect((await listingService.searchListings({})).total).toBe(0);
    await expect(listingService.updateListing(listing._id, requesterFor(user), { isActive: true })).rejects.toMatchObject({ statusCode: 403 });

    await listingService.moderateListing(admin, listing._id, { action: "unhide" });
    expect((await listingService.searchListings({})).total).toBe(1);
  });
});

describe("saved services and providers", () => {
  it("saves, lists only visible items, and unsaves", async () => {
    const customer = await makeUser();
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    await savedService.save(customer._id, "listings", String(listing._id));
    await savedService.save(customer._id, "listings", String(listing._id)); // idempotent
    await savedService.save(customer._id, "vendors", String(profile._id));
    let saved = await savedService.getSaved(customer._id);
    expect(saved.listings).toHaveLength(1);
    expect(saved.vendors).toHaveLength(1);

    await Listing.updateOne({ _id: listing._id }, { isActive: false });
    saved = await savedService.getSaved(customer._id);
    expect(saved.listings).toHaveLength(0); // hidden ones drop out
    await savedService.unsave(customer._id, "vendors", String(profile._id));
    expect((await savedService.getSaved(customer._id)).vendorIds).toHaveLength(0);
    await expect(savedService.save(customer._id, "nonsense", String(profile._id))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("provider analytics and customer reliability", () => {
  it("reports views, acceptance and completion rates", async () => {
    const { user, profile } = await makeVendor();
    const listing = await makeListing(profile);
    await Listing.updateOne({ _id: listing._id }, { views: 40 });
    const customer = await makeUser();
    await makeBooking({ listing, customer, vendorProfile: profile, status: "completed" });
    await makeBooking({ listing, customer, vendorProfile: profile, status: "declined" });
    const stats = await vendorService.getMyStats(user._id);
    expect(stats).toMatchObject({ views: 40, requests: 2, acceptanceRate: 50, completionRate: 100, conversionRate: 5 });
  });

  it("customer reliability needs history before judging", async () => {
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    const customer = await makeUser();
    expect((await trustService.customerStats(customer._id)).reliability).toBeNull();
    await makeBooking({ listing, customer, vendorProfile: profile, status: "completed" });
    await makeBooking({ listing, customer, vendorProfile: profile, status: "cancelled" });
    expect((await trustService.customerStats(customer._id)).reliability).toBe(50);
  });
});
