import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Listing, VendorProfile, makeUser, makeVendor, makeListing, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const listingService = require("../src/services/listingService.js");
const vendorService = require("../src/services/vendorService.js");
const { syncListingsForVendor } = require("../src/services/listingSync.js");

describe("scalable search", () => {
  it("ranks the whole catalogue: an old listing from a top vendor beats 320 newer ones", async () => {
    const { profile: top } = await makeVendor();
    await VendorProfile.updateOne({ _id: top._id }, { trustScore: 99 });
    const old = await makeListing(top, { title: "Veteran plumber" });
    await Listing.updateOne({ _id: old._id }, { createdAt: new Date("2020-01-01") });
    await syncListingsForVendor(top._id);

    const { profile: average } = await makeVendor();
    const base = (await makeListing(average, { title: "Filler" })).toObject();
    delete base._id;
    await Listing.insertMany(Array.from({ length: 320 }, (_, i) => ({ ...base, title: `Filler ${i}`, createdAt: new Date() })));

    const { listings, total } = await listingService.searchListings({});
    expect(total).toBe(322);
    expect(listings[0].title).toBe("Veteran plumber"); // the old in-memory top-300 would have missed it
  });

  it("uses an index for the default search (no collection scan)", async () => {
    const { profile } = await makeVendor();
    await makeListing(profile);
    await Listing.syncIndexes();
    const plan = await Listing.find({ isActive: true, vendorVerified: true }).sort({ featuredUntil: -1, vendorTrust: -1, createdAt: -1 }).limit(12).explain("queryPlanner");
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain("IXSCAN");
  });

  it("filters by distance and rating on listing fields, and finds vendors by name", async () => {
    const { profile: lahore } = await makeVendor({ businessName: "Bright Path Tutoring" }); // factory: Lahore coords
    await VendorProfile.updateOne({ _id: lahore._id }, { avgRating: 4.6 });
    await makeListing(lahore, { title: "Algebra help" });
    const { profile: karachi } = await makeVendor({ serviceArea: { city: "Karachi", location: { type: "Point", coordinates: [67.0, 24.86] } } });
    await makeListing(karachi, { title: "Karachi algebra" });
    await syncListingsForVendor(lahore._id);

    const near = await listingService.searchListings({ lat: 31.52, lng: 74.35, radiusKm: 30 });
    expect(near.listings.map((l) => l.title)).toEqual(["Algebra help"]);
    expect((await listingService.searchListings({ minRating: 4.5 })).listings.map((l) => l.title)).toEqual(["Algebra help"]);
    expect((await listingService.searchListings({ q: "bright path" })).total).toBe(1);
  });

  it("a vendor losing approval disappears from search immediately", async () => {
    const { profile } = await makeVendor();
    await makeListing(profile);
    expect((await listingService.searchListings({})).total).toBe(1);
    const admin = requesterFor(await makeUser({ role: "admin" }));
    await vendorService.requestChanges(profile._id, admin, { items: ["description"] });
    expect((await listingService.searchListings({})).total).toBe(0);
  });

  it("caps deep pagination", async () => {
    const result = await listingService.searchListings({ page: 999999 });
    expect(result.page).toBe(500);
  });
});
