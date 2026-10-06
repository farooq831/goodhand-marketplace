const notificationService = require("../services/notificationService");

async function getMine(req, res, next) {
  try {
    const unreadOnly = req.query.unread === "true";
    const notifications = await notificationService.getMyNotifications(req.user.id, { unreadOnly });
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ notification });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMine, getUnreadCount, markRead };
