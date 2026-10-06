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
};

async function sendNotificationEmail(userId, type, payload = {}) {
  if (!transporter || !userId) return;
  const user = await User.findById(userId).select("email name");
  if (!user?.email) return;

  const subject = subjects[type] || "Local Services Marketplace notification";
  const details = Object.entries(payload)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject,
    text: `Hello ${user.name},\n\n${subject}.\n\n${details}`,
  });
}

module.exports = { sendNotificationEmail };
