const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Without SMTP in development, emails are written here instead of being
// silently dropped, so the exact message a user would get can be read.
const DEV_OUTBOX = path.resolve(__dirname, "../../dev-outbox");
const useDevOutbox = !transporter && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

const appUrl = (route) => `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "")}${route}`;

const subjects = {
  booking_request: "New booking request",
  booking_accepted: "Your booking was accepted",
  booking_declined: "Your booking was declined",
  payment_confirmed: "Payment confirmed",
  message_received: "New booking message",
  review_received: "You received a review",
  revision_requested: "A revision was requested on your work",
  dispute_opened: "A dispute was opened",
  dispute_resolved: "Your dispute has been resolved",
  booking_disputed: "A dispute was opened on your booking",
  vendor_changes_requested: "Action needed: update your Goodhand vendor profile",
  vendor_approved: "Your Goodhand vendor profile is approved",
  vendor_submitted: "New vendor waiting for verification",
  vendor_resubmitted: "A vendor updated their profile for review",
  payout_sent: "Your Goodhand payout has been sent",
  booking_reminder: "Reminder: you have a booking coming up",
};

// Readable bodies for the messages people act on. Anything not listed
// falls back to the generic subject + link.
const bodies = {
  vendor_changes_requested: ({ businessName, items = [], note }) => [
    `Thanks for registering ${businessName} on Goodhand. Before we can approve your profile, please update the following:`,
    "",
    ...items.map((item) => `  • ${item}`),
    ...(note ? ["", `Note from our team: ${note}`] : []),
    "",
    "Please upload clear, readable photos (all four corners of the card visible, no glare).",
    `Update your profile here: ${appUrl("/dashboard/vendor/profile")}`,
    "",
    "Saving your profile sends it back to us for review automatically.",
  ],
  vendor_approved: ({ businessName }) => [
    `Good news — ${businessName} is now verified and visible to customers on Goodhand.`,
    "",
    `Add or review your services here: ${appUrl("/dashboard/vendor/listings")}`,
  ],
  vendor_submitted: ({ businessName }) => [`${businessName} registered as a vendor and is waiting for verification.`, "", `Review: ${appUrl("/dashboard/admin/vendors")}`],
  vendor_resubmitted: ({ businessName }) => [`${businessName} updated their profile after your change request.`, "", `Review: ${appUrl("/dashboard/admin/vendors")}`],
  payout_sent: ({ amount, reference, count, method }) => [
    `We've sent you Rs ${amount} for ${count} completed booking${count === 1 ? "" : "s"}.`,
    "",
    ...(method ? [`Sent to: ${method}`] : []),
    `Transaction reference: ${reference}`,
    "",
    "Depending on your bank or wallet it can take up to 1–2 working days to appear.",
    `See your earnings: ${appUrl("/dashboard/vendor/earnings")}`,
  ],
  booking_reminder: ({ title, date, startTime, when, address, bookingId }) => [
    `This is a reminder that "${title}" is ${when === "soon" ? "starting soon" : "tomorrow"} — ${date} at ${startTime}.`,
    ...(address ? ["", `Address: ${address}`] : []),
    "",
    `View the booking: ${appUrl(`/booking/${bookingId}`)}`,
    "If something has changed, message the other person from the booking page as soon as possible.",
  ],
};

function composeText(name, type, payload) {
  const subject = subjects[type] || "Goodhand notification";
  const lines = bodies[type]
    ? bodies[type](payload)
    : [`${subject}.`, ...(payload.bookingId ? ["", `View it here: ${appUrl(`/booking/${payload.bookingId}`)}`] : [])];
  return { subject, text: [`Hello ${name},`, "", ...lines, "", "— The Goodhand team"].join("\n") };
}

// SMTP when configured; the dev outbox otherwise; nothing in tests.
async function deliver(email, subject, text, tag) {
  if (!transporter) {
    if (!useDevOutbox) return;
    fs.mkdirSync(DEV_OUTBOX, { recursive: true });
    const file = path.join(DEV_OUTBOX, `${new Date().toISOString().replace(/[:.]/g, "-")}_${tag}_${email}.txt`);
    fs.writeFileSync(file, `To: ${email}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, text });
}

async function sendNotificationEmail(userId, type, payload = {}) {
  if ((!transporter && !useDevOutbox) || !userId) return;
  const user = await User.findById(userId).select("email name");
  if (!user?.email) return;

  const { subject, text } = composeText(user.name, type, payload);
  await deliver(user.email, subject, text, type);
}

// Account emails (verification, password reset) that aren't in-app
// notifications. `lines` is the body between the greeting and sign-off.
async function sendAccountEmail({ email, name }, subject, lines, tag) {
  const text = [`Hello ${name},`, "", ...lines, "", "— The Goodhand team"].join("\n");
  await deliver(email, subject, text, tag);
}

module.exports = { sendNotificationEmail, sendAccountEmail, composeText, appUrl };
