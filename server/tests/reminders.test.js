import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Booking, makeUser, makeVendor, makeListing, makeBooking } from "./helpers/factories.js";

const require = createRequire(import.meta.url);
const { sendBookingReminders, startInstant } = require("../src/jobs/bookingReminders.js");
const Notification = require("../src/models/Notification.js");

// Booking times are Pakistan wall-clock (UTC+5 by default).
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2030-01-10T03:00:00.000Z"); // 08:00 in Pakistan

async function setup() {
  const { user: vendorUser, profile } = await makeVendor();
  const listing = await makeListing(profile);
  const customer = await makeUser();
  const book = (date, startTime, status = "accepted") => makeBooking({ listing, customer, vendorProfile: profile, status, date: day(date), startTime, endTime: "23:00" });
  return { vendorUser, customer, book };
}
const remindersFor = (userId, when) => Notification.countDocuments({ userId, type: "booking_reminder", ...(when ? { "payload.when": when } : {}) });

describe("booking reminders", () => {
  it("converts slot wall-clock time using the Pakistan offset", async () => {
    const { book } = await setup();
    const b = await book("2030-01-10", "09:30");
    expect(startInstant(b).toISOString()).toBe("2030-01-10T04:30:00.000Z");
  });

  it("sends 'soon' within 2h and 'upcoming' within 24h to both sides, nothing for later or unaccepted bookings", async () => {
    const { vendorUser, customer, book } = await setup();
    const soon = await book("2030-01-10", "09:30"); // 1.5h away
    const tomorrow = await book("2030-01-11", "07:00"); // 23h away
    await book("2030-01-12", "10:00"); // 50h away — too early
    await book("2030-01-10", "10:00", "pending"); // not accepted

    expect(await sendBookingReminders(NOW)).toBe(2);
    expect(await remindersFor(customer._id, "soon")).toBe(1);
    expect(await remindersFor(customer._id, "upcoming")).toBe(1);
    expect(await remindersFor(vendorUser._id)).toBe(2);
    expect((await Booking.findById(soon._id)).reminders.dayBefore).not.toBeNull(); // won't send a late "upcoming" after "soon"
    expect((await Booking.findById(tomorrow._id)).reminders.soon).toBeNull();
  });

  it("never sends the same reminder twice, and follows up with 'soon' later", async () => {
    const { customer, book } = await setup();
    const b = await book("2030-01-11", "07:00");
    await sendBookingReminders(NOW);
    await sendBookingReminders(NOW);
    expect(await remindersFor(customer._id, "upcoming")).toBe(1);

    const later = new Date(startInstant(b).getTime() - 60 * 60 * 1000); // 1h before
    await sendBookingReminders(later);
    await sendBookingReminders(later);
    expect(await remindersFor(customer._id, "soon")).toBe(1);
  });

  it("skips bookings that already started or were cancelled", async () => {
    const { customer, book } = await setup();
    await book("2030-01-10", "07:00"); // started at 02:00Z, before NOW
    await book("2030-01-10", "09:00", "cancelled");
    expect(await sendBookingReminders(NOW)).toBe(0);
    expect(await remindersFor(customer._id)).toBe(0);
  });
});
