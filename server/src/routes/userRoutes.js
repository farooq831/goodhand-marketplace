const express = require("express");
const authenticate = require("../middleware/auth");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/me", authenticate, userController.getMe);
router.get("/profile/:id", userController.getPublicProfile);
router.patch("/me", authenticate, userController.updateMe);

// Customer shortlists (saved services / providers).
const savedService = require("../services/savedService");
const requireRole = require("../middleware/roleGuard");
const wrap = (fn) => async (req, res, next) => { try { res.json(await fn(req)); } catch (err) { next(err); } };
router.get("/me/saved", authenticate, requireRole("customer"), wrap((req) => savedService.getSaved(req.user.id)));
router.put("/me/saved/:kind/:id", authenticate, requireRole("customer"), wrap((req) => savedService.save(req.user.id, req.params.kind, req.params.id)));
router.delete("/me/saved/:kind/:id", authenticate, requireRole("customer"), wrap((req) => savedService.unsave(req.user.id, req.params.kind, req.params.id)));

module.exports = router;
