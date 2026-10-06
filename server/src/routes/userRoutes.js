const express = require("express");
const authenticate = require("../middleware/auth");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/me", authenticate, userController.getMe);
router.get("/profile/:id", userController.getPublicProfile);
router.patch("/me", authenticate, userController.updateMe);

module.exports = router;
