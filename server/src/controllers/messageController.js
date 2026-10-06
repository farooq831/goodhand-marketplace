const messageService = require("../services/messageService");

async function getForBooking(req, res, next) {
  try {
    const messages = await messageService.getMessages(req.params.bookingId, req.user);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

async function createForBooking(req, res, next) {
  try {
    const message = await messageService.createMessage(req.params.bookingId, req.user, req.body.text);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
}

module.exports = { getForBooking, createForBooking };
