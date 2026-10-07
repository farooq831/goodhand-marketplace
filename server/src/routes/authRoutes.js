const express = require("express");
const authController = require("../controllers/authController");
const authenticate = require("../middleware/auth");
const { loginLimiter, registerLimiter, emailLimiter } = require("../middleware/rateLimits");

const router = express.Router();

router.post("/register", registerLimiter, authController.register);
router.post("/login", loginLimiter, authController.login);
router.post("/google", loginLimiter, authController.googleLogin);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", authController.logout);

router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authenticate, emailLimiter, authController.resendVerification);
router.post("/forgot-password", emailLimiter, authController.forgotPassword);
router.post("/reset-password", loginLimiter, authController.resetPassword);

module.exports = router;
