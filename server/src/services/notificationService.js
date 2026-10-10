const Notification = require("../models/Notification");
const User = require("../models/User");
const emailService = require("./emailService");

// Generic creator — bookingService and paymentService call this directly
// at their existing event points; messages (task 5.3) and reviews (task
// 6.1) will do the same once those features exist. Kept dependency-free
// (only touches its own model) so nothing needs to require it back.
async function createNotification(userId, type, payload = {}) {
  if (!userId) return null; // e.g. no vendor profile yet — nobody to notify
  const notification = await Notification.create({ userId, type, payload });
  emailService.sendNotificationEmail(userId, type, payload).catch((err) => {
    console.error("Email notification failed:", err.message);
  });
  return notification;
}

// Fan out to everyone holding a role rather than to a known user id —
// needed for "a dispute was opened", where the recipient is whichever
// admins happen to exist rather than a participant in the booking.
// Requiring User is safe: it has no dependency back on this service.
async function notifyRole(role, type, payload = {}) {
  const users = await User.find({ role, status: "active" }).select("_id");
  return Promise.all(users.map((user) => createNotification(user._id, type, payload)));
}

async function getMyNotifications(userId, { unreadOnly } = {}) {
  const filter = { userId };
  if (unreadOnly) filter.isRead = false;
  return Notification.find(filter).sort({ createdAt: -1 }).limit(50);
}

async function markAsRead(notificationId, userId) {
  return Notification.findOneAndUpdate({ _id: notificationId, userId }, { isRead: true }, { new: true });
}

async function getUnreadCount(userId) {
  return Notification.countDocuments({ userId, isRead: false });
}

module.exports = { createNotification, notifyRole, getMyNotifications, markAsRead, getUnreadCount };
