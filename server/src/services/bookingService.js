const Booking = require("../models/Booking");
const Listing = require("../models/Listing");
const VendorProfile = require("../models/VendorProfile");
const ApiError = require("../utils/ApiError");
const { blockingEntry } = require("../utils/timeOff");
const { addMinutes, doRangesOverlap } = require("../utils/timeSlots");
const { resolveBookingRequesterRole } = require("../utils/bookingAccess");
const { getIO } = require("../sockets");
const paymentService = require("./paymentService");
const notificationService = require("./notificationService");

// Pakistani mobile/landline, with or without +92 / 0 prefix and separators.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{8,16}$/;

// The service address is what lets a home-service vendor actually turn
// up; without it a booking for a plumber or cleaner is unusable.
function serviceDetails(listing, { serviceAddress = {}, contactPhone = "", notes = "" }) {
  const trimmedNotes = String(notes || "").trim();
  if (trimmedNotes.length > 1000) throw new ApiError(400, "Notes must be 1000 characters or fewer");
  if (listing.serviceLocation !== "customer") {
    return { serviceLocation: listing.serviceLocation, notes: trimmedNotes };
  }

  const address = {
    line: String(serviceAddress.line || "").trim(),
    area: String(serviceAddress.area || "").trim(),
    city: String(serviceAddress.city || "").trim(),
  };
  const phone = String(contactPhone || "").trim();
  if (!address.line || !address.city) throw new ApiError(400, "Please enter the service address (house/street and city)");
  if (!PHONE_PATTERN.test(phone)) throw new ApiError(400, "Please enter a valid contact phone number");
  return { serviceLocation: "customer", serviceAddress: address, contactPhone: phone, notes: trimmedNotes };
}

async function createBooking(customerId, { listingId, date, startTime, ...details }) {
  if (!listingId || !date || !startTime) {
    throw new ApiError(400, "listingId, date, and startTime are required");
  }

  const listing = await Listing.findById(listingId).populate("vendorId");
  if (!listing || !listing.isActive || !listing.vendorId?.isVerified) {
    throw new ApiError(404, "Listing not found");
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) throw new ApiError(400, "Invalid date");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (parsedDate < today) throw new ApiError(400, "That date has already passed");
  if (blockingEntry(listing.vendorId.timeOff, parsedDate)) {
    throw new ApiError(400, "The provider is unavailable on that date — please pick another day");
  }

  const extra = serviceDetails(listing, details);

  if (!listing.availabilityRules.daysOfWeek.includes(parsedDate.getUTCDay())) {
    throw new ApiError(400, "Listing is not available on that day");
  }

  const endTime = addMinutes(startTime, listing.durationMinutes);
  if (startTime < listing.availabilityRules.startTime || endTime > listing.availabilityRules.endTime) {
    throw new ApiError(400, "Requested time is outside the listing's availability window");
  }

  await assertNoConflict(listing.vendorId._id, parsedDate, startTime, endTime);

  const booking = await Booking.create({
    listingId: listing._id,
    customerId,
    vendorId: listing.vendorId._id,
    slot: { date: parsedDate, startTime, endTime },
    price: listing.price,
    ...extra,
    status: "pending",
    statusHistory: [{ status: "pending", changedAt: new Date(), changedBy: customerId }],
  });

  await notificationService
    .createNotification(listing.vendorId.userId, "booking_request", { bookingId: booking._id })
    .catch((err) => console.error("Notification failed:", err.message));

  return booking;
}

// PRD §5.4 / Architecture.md §7: only *accepted* slots block the calendar
// — competing pending requests are fine; the vendor sorts them out by
// accepting one (which re-checks this) and declining the rest.
async function assertNoConflict(vendorId, date, startTime, endTime, excludeBookingId) {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const query = { vendorId, status: "accepted", "slot.date": { $gte: dayStart, $lt: dayEnd } };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const sameDayAccepted = await Booking.find(query);
  const conflict = sameDayAccepted.some((b) =>
    doRangesOverlap(startTime, endTime, b.slot.startTime, b.slot.endTime)
  );
  if (conflict) throw new ApiError(409, "That time slot is no longer available");
}

async function getBookingById(id, requester) {
  const booking = await Booking.findById(id)
    .populate("listingId", "title price durationMinutes")
    .populate("customerId", "name email")
    .populate({
      path: "vendorId",
      select: "businessName userId",
      populate: { path: "userId", select: "name email" },
    })
    // So the timeline reads "Muhammad Farooq requested a revision" — the
    // admin dispute view is built entirely out of this.
    .populate("statusHistory.changedBy", "name role");
  if (!booking) throw new ApiError(404, "Booking not found");

  const { isCustomer, isVendor } = await resolveBookingRequesterRole(booking, requester);
  if (!isCustomer && !isVendor && requester.role !== "admin") {
    // Don't reveal that a booking with this id exists to an outsider.
    throw new ApiError(404, "Booking not found");
  }

  return booking;
}

async function getMyBookings(requester, statusFilter) {
  const filter = {};
  if (statusFilter) filter.status = statusFilter;

  if (requester.role === "vendor") {
    const vendorProfile = await VendorProfile.findOne({ userId: requester.id }).select("_id");
    if (!vendorProfile) return [];
    filter.vendorId = vendorProfile._id;
  } else {
    filter.customerId = requester.id;
  }

  return Booking.find(filter)
    .sort({ "slot.date": -1 })
    .populate("listingId", "title price durationMinutes")
    .populate("customerId", "name")
    .populate("vendorId", "businessName")
    .populate("paymentId", "amount commissionAmount status releasedAt payout");
}

// Architecture.md §6: every transition goes through this one function —
// validates it's legal for the current status, checks who's allowed to
// make it, writes statusHistory, and triggers side-effects: a refund on
// cancelled/declined, and a notification to whichever side didn't just
// act. Release-on-complete needs no explicit call here — the auto-release
// cron job (jobs/releasePayments.js) picks up any booking sitting in
// "completed" generically, on its own schedule.
//
// Keyed by "fromStatus->toStatus" since who's allowed to make a
// transition depends on both ends (e.g. only the customer can cancel a
// still-pending request, but either side can cancel after acceptance).
//
// Delivery is a loop, not a one-shot: "submitted->accepted" sends the work
// back for revision, so a booking can pass through accepted/submitted any
// number of times. Cancellation is deliberately *not* available from
// "submitted" — a customer who could take the files and then unilaterally
// refund themselves would have the vendor working for free, so once work
// is delivered the only ways money moves are the customer accepting or an
// admin adjudicating a dispute.
const TRANSITIONS = {
  "pending->accepted": ["vendor"],
  "pending->declined": ["vendor"],
  "pending->cancelled": ["customer"],
  "accepted->submitted": ["vendor"],
  "accepted->cancelled": ["customer", "vendor"],
  "accepted->disputed": ["customer", "vendor"],
  "submitted->completed": ["customer"],
  "submitted->accepted": ["customer"], // request a revision
  "submitted->disputed": ["customer", "vendor"],
  "completed->disputed": ["customer", "vendor"],
  // Admin adjudication. "completed" releases the held payment to the
  // vendor, "cancelled" refunds the customer via the side-effect below.
  "disputed->completed": ["admin"],
  "disputed->cancelled": ["admin"],
};

// Transitions that are meaningless without a reason. A dispute with no
// stated reason gives the admin nothing to adjudicate, a revision request
// with no reason gives the vendor nothing to fix, and an admin resolution
// with no rationale is unauditable.
const NOTE_REQUIRED = new Set([
  "submitted->accepted",
  "accepted->disputed",
  "submitted->disputed",
  "completed->disputed",
  "disputed->completed",
  "disputed->cancelled",
]);

// "pending" isn't here — that notification (booking_request) fires from
// createBooking instead, since updateBookingStatus only ever handles
// transitions away from an existing status.
const NOTIFICATION_TYPE_BY_STATUS = {
  accepted: "booking_accepted",
  submitted: "work_submitted",
  declined: "booking_declined",
  completed: "booking_completed",
  cancelled: "booking_cancelled",
  disputed: "booking_disputed",
};

// Where the target status alone would mislead: landing on "accepted" from
// "submitted" is a rejection, not an acceptance, and landing on
// completed/cancelled from "disputed" is an admin ruling, not either party
// finishing or walking away. Takes precedence over the by-status map.
const NOTIFICATION_TYPE_BY_TRANSITION = {
  "submitted->accepted": "revision_requested",
  "disputed->completed": "dispute_resolved",
  "disputed->cancelled": "dispute_resolved",
};

// Prefixes for the event message mirrored into the booking thread, so the
// conversation an admin reads contains the lifecycle turns and not just
// the chatter between them.
const EVENT_TEXT_BY_TRANSITION = {
  "submitted->accepted": "Requested a revision",
  "accepted->disputed": "Opened a dispute",
  "submitted->disputed": "Opened a dispute",
  "completed->disputed": "Opened a dispute",
  "disputed->completed": "Dispute resolved — payment released to the vendor",
  "disputed->cancelled": "Dispute resolved — payment refunded to the customer",
  "accepted->cancelled": "Cancelled the booking",
  "pending->cancelled": "Cancelled the booking",
  "pending->declined": "Declined the booking",
  "submitted->completed": "Accepted the delivered work",
};

async function updateBookingStatus(bookingId, requester, targetStatus, { files = [], note = "" } = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const { isCustomer, isVendor } = await resolveBookingRequesterRole(booking, requester);
  const isAdmin = requester.role === "admin";
  if (!isCustomer && !isVendor && !isAdmin) {
    throw new ApiError(403, "You do not have access to this booking");
  }

  const transitionKey = `${booking.status}->${targetStatus}`;
  const allowedRoles = TRANSITIONS[transitionKey];
  if (!allowedRoles) {
    throw new ApiError(400, `Cannot transition booking from ${booking.status} to ${targetStatus}`);
  }

  // "admin" is a role in the table like any other rather than a bypass —
  // an admin can adjudicate a dispute but can't, say, accept a booking on
  // a vendor's behalf. Being a party to the booking wins over being an
  // admin, which also means an admin who is themselves the customer or
  // vendor here cannot self-adjudicate.
  const requesterRole = isVendor ? "vendor" : isCustomer ? "customer" : isAdmin ? "admin" : null;
  if (!allowedRoles.includes(requesterRole)) {
    throw new ApiError(403, `Only the ${allowedRoles.join(" or ")} can do that`);
  }

  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (NOTE_REQUIRED.has(transitionKey) && !trimmedNote) {
    throw new ApiError(400, "A reason is required for this action");
  }

  if (transitionKey === "pending->accepted") {
    // Re-check at accept time, not just at request time — another
    // request for an overlapping slot could have been accepted since.
    // Scoped to this one transition: "submitted->accepted" is a revision
    // request on a booking that already holds the slot, so re-running the
    // check there could 409 the customer out of asking for a fix.
    await assertNoConflict(
      booking.vendorId,
      booking.slot.date,
      booking.slot.startTime,
      booking.slot.endTime,
      booking._id
    );
  }

  const deliveredFiles = [];
  if (targetStatus === "submitted") {
    if (!files.length || files.some((file) => typeof file !== "string" || !file.trim())) {
      throw new ApiError(400, "At least one work file is required");
    }
    deliveredFiles.push(...files.map((file) => file.trim()));
    booking.submittedFiles = deliveredFiles;
  }

  booking.status = targetStatus;
  booking.statusHistory.push({
    status: targetStatus,
    changedAt: new Date(),
    changedBy: requester.id,
    note: trimmedNote || null,
    files: deliveredFiles,
  });
  await booking.save();

  // Design.md §3.1: checkout happens right after picking a slot, before
  // the vendor has responded — so a held payment can exist even at
  // "pending", meaning both cancelled AND declined can need a refund,
  // not just cancelled (PRD's state diagram only annotates the
  // accepted→cancelled edge, but that's the common case, not the only one).
  if ((targetStatus === "cancelled" || targetStatus === "declined") && booking.paymentId) {
    try {
      await paymentService.refundPayment(booking._id);
    } catch (err) {
      // Don't fail the status transition itself over a payment
      // side-effect — e.g. checkout was never completed so there's
      // nothing held, or it was already resolved some other way.
      // adminService.resolveDispute re-reads the payment afterwards
      // because for an admin ruling this must not fail silently.
      console.error(`Refund side-effect failed for booking ${booking._id}:`, err.message);
    }
  }

  await postEventMessage(booking, requester, transitionKey, trimmedNote, deliveredFiles);
  await notifyCounterparty(booking, requester, targetStatus, transitionKey);

  emitBookingStatusUpdate(booking);
  return booking;
}

// Mirrors the transition into the booking's message thread as an "event"
// message. This is what makes a dispute discussable rather than just
// recorded: the reason lands in the same conversation the customer, vendor
// and admin are all reading, in order, next to the chatter it's about.
async function postEventMessage(booking, requester, transitionKey, note, deliveredFiles) {
  const Message = require("../models/Message");

  let text = EVENT_TEXT_BY_TRANSITION[transitionKey];
  if (transitionKey === "accepted->submitted") {
    const count = deliveredFiles.length;
    text = `Delivered work (${count} ${count === 1 ? "file" : "files"})`;
  } else if (transitionKey === "pending->accepted") {
    text = "Accepted the booking request";
  }
  if (!text) return;
  if (note) text += `: ${note}`;

  try {
    const message = await Message.create({
      bookingId: booking._id,
      senderId: requester.id,
      text,
      kind: "event",
    });
    const populated = await message.populate("senderId", "name role");
    // The previous submission-message path created the Message but never
    // emitted, so an open ChatPanel missed it until the next refetch.
    getIO()?.to(`booking:${booking._id}`).emit("message:receive", populated);
  } catch (err) {
    console.error(`Event message failed for booking ${booking._id}:`, err.message);
  }
}

async function notifyCounterparty(booking, requester, targetStatus, transitionKey) {
  const type = NOTIFICATION_TYPE_BY_TRANSITION[transitionKey] || NOTIFICATION_TYPE_BY_STATUS[targetStatus];
  if (!type) return;

  try {
    const vendorProfile = await VendorProfile.findById(booking.vendorId).select("userId");
    if (!vendorProfile) return;

    const payload = { bookingId: booking._id, status: targetStatus };
    const actorIsCustomer = String(booking.customerId) === String(requester.id);
    const actorIsVendor = String(vendorProfile.userId) === String(requester.id);

    // An admin resolving a dispute is party to neither side, so "the
    // counterparty" is both of them.
    const recipients = actorIsCustomer
      ? [vendorProfile.userId]
      : actorIsVendor
        ? [booking.customerId]
        : [booking.customerId, vendorProfile.userId];

    await Promise.all(recipients.map((id) => notificationService.createNotification(id, type, payload)));

    // Admins can't act on a dispute they don't know exists.
    if (targetStatus === "disputed") {
      await notificationService.notifyRole("admin", "dispute_opened", payload);
    }
  } catch (err) {
    console.error(`Notification failed for booking ${booking._id}:`, err.message);
  }
}

function emitBookingStatusUpdate(booking) {
  const io = getIO();
  if (!io) return;
  io.to(`booking:${booking._id}`).emit("booking:statusUpdate", {
    bookingId: booking._id,
    status: booking.status,
  });
}

module.exports = {
  createBooking,
  getBookingById,
  getMyBookings,
  updateBookingStatus,
  assertNoConflict,
};
