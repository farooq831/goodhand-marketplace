import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { makeUser, makeVendor, makeListing, makeBooking, nextSlotDate } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const vendorService = require("../src/services/vendorService.js");
const listingService = require("../src/services/listingService.js");
const bookingService = require("../src/services/bookingService.js");

const iso = (d) => d.toISOString().slice(0, 10);

describe("vendor time off", () => {
  async function vendorWithListing() {
    const { user, profile } = await makeVendor();
    const listing = await makeListing(profile);
    await listing.updateOne({ serviceLocation: "online" });
    return { user, profile, listing };
  }

  it("blocks availability, booking, and search on those days only", async () => {
    const { user, listing } = await vendorWithListing();
    const away = nextSlotDate(10);
    const free = nextSlotDate(13);
    await vendorService.addTimeOff(user._id, { from: iso(nextSlotDate(9)), to: iso(nextSlotDate(11)), reason: "Eid" });

    const blocked = await listingService.getAvailability(listing._id, iso(away));
    expect(blocked.isAvailableDay).toBe(false);
    expect(blocked.timeOff).toBe(true);
    expect((await listingService.getAvailability(listing._id, iso(free))).slots.length).toBeGreaterThan(0);

    const customer = await makeUser();
    await expect(bookingService.createBooking(customer._id, { listingId: listing._id, date: iso(away), startTime: "10:00" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(bookingService.createBooking(customer._id, { listingId: listing._id, date: iso(free), startTime: "10:00" })).resolves.toBeTruthy();

    const searchAway = await listingService.searchListings({ date: iso(away) });
    expect(searchAway.listings.map((l) => String(l._id))).not.toContain(String(listing._id));
    const searchFree = await listingService.searchListings({ date: iso(free) });
    expect(searchFree.listings.map((l) => String(l._id))).toContain(String(listing._id));
  });

  it("reports existing bookings in the new period without cancelling them", async () => {
    const { user, profile, listing } = await vendorWithListing();
    const customer = await makeUser();
    const booking = await makeBooking({ listing, customer, vendorProfile: profile, status: "accepted", date: nextSlotDate(20) });
    const { conflicts } = await vendorService.addTimeOff(user._id, { from: iso(nextSlotDate(19)), to: iso(nextSlotDate(21)) });
    expect(conflicts.map((b) => String(b._id))).toEqual([String(booking._id)]);
  });

  it("validates ranges and can be removed", async () => {
    const { user } = await vendorWithListing();
    await expect(vendorService.addTimeOff(user._id, { from: iso(nextSlotDate(5)), to: iso(nextSlotDate(3)) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(vendorService.addTimeOff(user._id, { from: "2020-01-01", to: "2020-01-02" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(vendorService.addTimeOff(user._id, { from: "nonsense" })).rejects.toMatchObject({ statusCode: 400 });

    const { timeOff } = await vendorService.addTimeOff(user._id, { from: iso(nextSlotDate(4)) }); // single day
    expect(timeOff).toHaveLength(1);
    expect(iso(timeOff[0].from)).toBe(iso(timeOff[0].to));
    const after = await vendorService.removeTimeOff(user._id, timeOff[0]._id);
    expect(after.timeOff).toHaveLength(0);
    await expect(vendorService.removeTimeOff(user._id, timeOff[0]._id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("is not exposed on the public profile", async () => {
    const { user, profile } = await vendorWithListing();
    await vendorService.addTimeOff(user._id, { from: iso(nextSlotDate(4)), reason: "Hospital appointment" });
    expect(await vendorService.getById(profile._id)).not.toHaveProperty("timeOff");
  });
});
