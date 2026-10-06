const express = require("express");
const authenticate = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const requireRole = require("../middleware/roleGuard");
const listingController = require("../controllers/listingController");

const router = express.Router();

router.get("/", listingController.search);
// /mine before /:id so Express doesn't treat "mine" as an id param.
router.get("/mine", authenticate, requireRole("vendor"), listingController.getMine);
router.post("/", authenticate, requireRole("vendor"), listingController.create);
router.get("/:id", optionalAuth, listingController.getOne);
router.patch("/:id", authenticate, listingController.update);
router.delete("/:id", authenticate, listingController.remove);
router.get("/:id/availability", listingController.availability);

module.exports = router;
