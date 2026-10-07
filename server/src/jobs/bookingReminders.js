const cron = require("node-cron");
const Booking = require("../models/Booking");
const VendorProfile = require("../models/VendorProfile");
const notificationService = require("../services/notificationService");
const { timeToMinutes } = require("../utils/timeSlots");

// Booking slots are a date (UTC midnight) plus a local wall-clock time
// ("10:00" means 10am where the business runs). This offset turns that
// into a real instant. Default: Pakistan Standard Time, UTC+5, no DST.
const UTC_OFFSET_MINUTES = Number(process.env.APP_UTC_OFFSET_MINUTES ?? 300);

const HOUR = 60 * 60 * 1000;
const DAY_BEFORE_WINDOW = 24 * HOUR; // "coming up" reminder once within 24h
const SOON_WINDOW = 2 * HOUR; // "starting soon" reminder once within 2h

function startInstant(booking) {
  const midnight = new Date(booking.slot.date).getTime();
  return new Date(midnight + (timeToMinutes(booking.slot.startTime) - UTC_OFFSET_MINUTES) * 60 * 1000);
}

function payloadFor(booking, when) {
  const address = booking.serviceLocation === "customer" && booking.serviceAddress?.line
    ? [booking.serviceAddress.line, booking.serviceAddress.area, booking.serviceAddress.city].filter(Boolean).join(", ")
    : "";
  return {
    bookingId: booking._id,
    when,
    title: booking.listingId?.title || "Your booking",
    date: new Date(booking.slot.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    startTime: booking.slot.startTime,
    address,
  };
}

// Claim the reminder atomically before sending, so overlapping runs (or two
// server instances) can never send the same reminder twice.
async function claim(bookingId, field, extra = {}) {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "accepted", [`reminders.${field}`]: null },
    { $set: { [`reminders.${field}`]: new Date(), ...extra } },
    { new: true }
  );
  return !!claimed;
}

async function notifyBoth(booking, when) {
  const vendor = await VendorProfile.findById(booking.vendorId).select("userId");
  const payload = payloadFor(booking, when);
  await Promise.all(
    [booking.customerId, vendor?.userId].filter(Boolean).map((userId) =>
      notificationService.createNotification(userId, "booking_reminder", payload).catch((err) => console.error("Reminder failed:", err.message))
    )
  );
}

async function sendBookingReminders(now = new Date()) {
  // Only accepted bookings whose date is near enough to matter.
  const from = new Date(now.getTime() - DAY_BEFORE_WINDOW);
  const to = new Date(now.getTime() + 2 * DAY_BEFORE_WINDOW);
  const candidates = await Booking.find({
    status: "accepted",
    "slot.date": { $gte: from, $lte: to },
    $or: [{ "reminders.dayBefore": null }, { "reminders.soon": null }],
  }).populate("listingId", "title");

  let sent = 0;
  for (const booking of candidates) {
    const msUntil = startInstant(booking).getTime() - now.getTime();
    if (msUntil <= 0) continue; // already started

    if (msUntil <= SOON_WINDOW) {
      // Also marks the day-before slot so it isn't sent after this one.
      if (await claim(booking._id, "soon", booking.reminders?.dayBefore ? {} : { "reminders.dayBefore": new Date() })) {
        await notifyBoth(booking, "soon");
        sent += 1;
      }
    } else if (msUntil <= DAY_BEFORE_WINDOW && !booking.reminders?.dayBefore) {
      if (await claim(booking._id, "dayBefore")) {
        await notifyBoth(booking, "upcoming");
        sent += 1;
      }
    }
  }
  return sent;
}

function startBookingReminderJob() {
  // Every 15 minutes keeps the 2-hour reminder reasonably on time.
  cron.schedule("*/15 * * * *", () => {
    sendBookingReminders().catch((err) => console.error("Booking reminder job crashed:", err));
  });
}

module.exports = { sendBookingReminders, startBookingReminderJob, startInstant };
