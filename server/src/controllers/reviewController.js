const reviewService = require("../services/reviewService");

async function create(req, res, next) {
  try { res.status(201).json({ review: await reviewService.createReview(req.user.id, req.body) }); } catch (err) { next(err); }
}

async function respond(req, res, next) {
  try { res.json({ review: await reviewService.respondToReview(req.params.id, req.user.id, req.body.response) }); } catch (err) { next(err); }
}

async function getForVendor(req, res, next) {
  try { res.json({ reviews: await reviewService.getVendorReviews(req.params.vendorId) }); } catch (err) { next(err); }
}

async function getForCustomer(req, res, next) {
  try { res.json({ reviews: await reviewService.getCustomerReviews(req.params.customerId) }); } catch (err) { next(err); }
}

module.exports = { create, respond, getForVendor, getForCustomer };
