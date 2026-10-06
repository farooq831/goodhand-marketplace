const bookingService = require("../services/bookingService");

async function create(req, res, next) {
  try {
    const booking = await bookingService.createBooking(req.user.id, req.body);
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const bookings = await bookingService.getMyBookings(req.user, req.query.status);
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const booking = await bookingService.updateBookingStatus(req.params.id, req.user, req.body.status, {
      files: req.body.files,
      note: req.body.note,
    });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getMine, getOne, updateStatus };
