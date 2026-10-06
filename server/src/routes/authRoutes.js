const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/google", authController.googleLogin);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);

// POST /google is deferred until real Google OAuth credentials are
// available to test against (Architecture.md §4 lists it under /api/auth).

module.exports = router;
