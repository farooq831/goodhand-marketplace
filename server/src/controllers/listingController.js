const listingService = require("../services/listingService");
const vendorService = require("../services/vendorService");
const ApiError = require("../utils/ApiError");

async function search(req, res, next) {
  try {
    const result = await listingService.searchListings(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const vendorProfile = await vendorService.getByUserId(req.user.id);
    if (!vendorProfile) throw new ApiError(404, "Create a vendor profile first");
    const listings = await listingService.getMyListings(vendorProfile);
    res.json({ listings });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const vendorProfile = await vendorService.getByUserId(req.user.id);
    if (!vendorProfile) {
      throw new ApiError(400, "Create a vendor profile before adding listings");
    }
    const listing = await listingService.createListing(vendorProfile, req.body);
    res.status(201).json({ listing });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const listing = await listingService.getListingForOwnerOrPublic(req.params.id, req.user);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const listing = await listingService.updateListing(req.params.id, req.user, req.body);
    res.json({ listing });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await listingService.deleteListing(req.params.id, req.user);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function availability(req, res, next) {
  try {
    const result = await listingService.getAvailability(req.params.id, req.query.date);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { search, getMine, create, getOne, update, remove, availability };
