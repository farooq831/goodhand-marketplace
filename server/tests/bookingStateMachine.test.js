import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Booking, makeUser, makeVendor, makeListing, makeBooking, requesterFor } from "./helpers/factories.js";

const require = createRequire(import.meta.url);

const bookingService = require("../src/services/bookingService.js");

async function setup(status = "pending") {
  const customer = await makeUser();
  const { user: vendorUser, profile } = await makeVendor();
  const admin = await makeUser({ role: "admin", name: "Admin" });
  const listing = await makeListing(profile);
  const booking = await makeBooking({ listing, customer, vendorProfile: profile, status });
  return {
    booking,
    customer: requesterFor(customer),
    vendor: requesterFor(vendorUser),
    admin: requesterFor(admin),
    outsider: requesterFor(await makeUser()),
  };
}

const transition = (booking, who, status, opts) => bookingService.updateBookingStatus(booking._id, who, status, opts);

describe("updateBookingStatus — the single booking state machine", () => {
  it("walks the happy path pending → accepted → submitted → completed and records every step", async () => {
    const { booking, customer, vendor } = await setup();

    await transition(booking, vendor, "accepted");
    await transition(booking, vendor, "submitted", { files: ["https://example.com/work.pdf"] });
    const done = await transition(booking, customer, "completed");

    expect(done.status).toBe("completed");
    // statusHistory is appended to, never overwritten (CLAUDE.md domain rule).
    expect(done.statusHistory.map((h) => h.status)).toEqual(["pending", "accepted", "submitted", "completed"]);
    expect(String(done.statusHistory.at(-1).changedBy)).toBe(customer.id);
  });

  it("rejects transitions that aren't edges in the graph", async () => {
    const { booking, customer, vendor } = await setup();
    await expect(transition(booking, vendor, "completed")).rejects.toMatchObject({ statusCode: 400 });
    await expect(transition(booking, customer, "submitted")).rejects.toMatchObject({ statusCode: 400 });

    const unchanged = await Booking.findById(booking._id);
    expect(unchanged.status).toBe("pending");
    expect(unchanged.statusHistory).toHaveLength(1);
  });

  it("enforces who may take each edge", async () => {
    const { booking, customer, vendor } = await setup();
    // Only the vendor accepts; only the customer cancels a pending request.
    await expect(transition(booking, customer, "accepted")).rejects.toMatchObject({ statusCode: 403 });
    await expect(transition(booking, vendor, "cancelled")).rejects.toMatchObject({ statusCode: 403 });
    await transition(booking, customer, "cancelled");
    expect((await Booking.findById(booking._id)).status).toBe("cancelled");
  });

  it("hides the booking from people who aren't party to it", async () => {
    const { booking, outsider } = await setup();
    await expect(transition(booking, outsider, "accepted")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("does not let an admin act as a party — admins only adjudicate disputes", async () => {
    const { booking, admin } = await setup();
    await expect(transition(booking, admin, "accepted")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("requires a reason to open a dispute", async () => {
    const { booking, customer } = await setup("accepted");
    await expect(transition(booking, customer, "disputed")).rejects.toMatchObject({ statusCode: 400 });
    await expect(transition(booking, customer, "disputed", { note: "   " })).rejects.toMatchObject({ statusCode: 400 });

    const disputed = await transition(booking, customer, "disputed", { note: "Vendor never showed up" });
    expect(disputed.statusHistory.at(-1).note).toBe("Vendor never showed up");
  });

  it("requires delivered files when submitting work", async () => {
    const { booking, vendor } = await setup("accepted");
    await expect(transition(booking, vendor, "submitted")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("does not let the customer cancel after work is delivered", async () => {
    const { booking, customer } = await setup("submitted");
    await expect(transition(booking, customer, "cancelled")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks accepting a request whose slot another accepted booking already holds", async () => {
    const { booking, vendor } = await setup();
    const fresh = await Booking.findById(booking._id).populate("listingId");
    // Same vendor, same slot, already accepted.
    await Booking.create({
      listingId: fresh.listingId._id,
      customerId: fresh.customerId,
      vendorId: fresh.vendorId,
      slot: fresh.slot,
      price: fresh.price,
      status: "accepted",
      statusHistory: [{ status: "accepted", changedAt: new Date(), changedBy: fresh.customerId }],
    });
    await expect(transition(booking, vendor, "accepted")).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("createBooking — service address, notes and dates", () => {
  const { nextSlotDate } = require("./helpers/factories.js");
  const iso = (d) => d.toISOString().slice(0, 10);
  const address = { serviceAddress: { line: "House 12, Street 4", area: "DHA Phase 5", city: "Lahore" }, contactPhone: "0300 1234567" };

  async function listingWith(serviceLocation) {
    const { profile } = await makeVendor();
    const listing = await makeListing(profile);
    if (serviceLocation) await listing.updateOne({ serviceLocation });
    return listing;
  }

  it("at-customer services require an address and a valid phone, and store them with the notes", async () => {
    const customer = await makeUser();
    const listing = await listingWith("customer");
    const base = { listingId: listing._id, date: iso(nextSlotDate()), startTime: "10:00" };

    await expect(bookingService.createBooking(customer._id, base)).rejects.toMatchObject({ statusCode: 400 });
    await expect(bookingService.createBooking(customer._id, { ...base, ...address, contactPhone: "abc" })).rejects.toMatchObject({ statusCode: 400 });

    const booking = await bookingService.createBooking(customer._id, { ...base, ...address, notes: "  Tap leaking under the sink  " });
    expect(booking.serviceLocation).toBe("customer");
    expect(booking.serviceAddress.city).toBe("Lahore");
    expect(booking.contactPhone).toBe("0300 1234567");
    expect(booking.notes).toBe("Tap leaking under the sink");
  });

  it("online services need no address", async () => {
    const customer = await makeUser();
    const listing = await listingWith("online");
    const booking = await bookingService.createBooking(customer._id, { listingId: listing._id, date: iso(nextSlotDate()), startTime: "11:00", notes: "Chapter 4" });
    expect(booking.serviceLocation).toBe("online");
    expect(booking.serviceAddress?.line || "").toBe("");
  });

  it("rejects dates in the past", async () => {
    const customer = await makeUser();
    const listing = await listingWith("online");
    const yesterday = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    await expect(bookingService.createBooking(customer._id, { listingId: listing._id, date: iso(yesterday), startTime: "10:00" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
