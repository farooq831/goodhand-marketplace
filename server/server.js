const path = require("path");
// No override: variables already set in the environment (a hosting
// platform's config, or a one-off MONGODB_URI in the shell) win over .env.
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const connectDB = require("./src/config/db");
const initSocket = require("./src/sockets");
const notFound = require("./src/middleware/notFound");
const errorHandler = require("./src/middleware/errorHandler");
const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const vendorRoutes = require("./src/routes/vendorRoutes");
const listingRoutes = require("./src/routes/listingRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const bookingRoutes = require("./src/routes/bookingRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const paymentController = require("./src/controllers/paymentController");
const notificationRoutes = require("./src/routes/notificationRoutes");
const messageRoutes = require("./src/routes/messageRoutes");
const reviewRoutes = require("./src/routes/reviewRoutes");
const uploadRoutes = require("./src/routes/uploadRoutes");
const { startPaymentReleaseJob } = require("./src/jobs/releasePayments");

const app = express();
// Render/Railway terminate TLS at a proxy; trust it so req.secure and
// req.ip reflect the real client connection.
app.set("trust proxy", 1);

// Standard security headers. Cross-origin resource policy is relaxed so the
// client (a different origin) can display images served from /uploads.
app.use(require("helmet")({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use("/api", require("./src/middleware/rateLimits").apiLimiter);

function isAllowedOrigin(origin, callback) {
  if (!origin || origin === process.env.CLIENT_URL || (process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(origin))) {
    return callback(null, true);
  }
  return callback(new Error("Origin not allowed by CORS"));
}

app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  })
);

// Stripe needs the raw, unparsed request body to verify a webhook's
// signature — this has to be registered before express.json() below,
// since that would otherwise consume the body stream for every request.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentController.handleWebhook
);

app.use(express.json({ limit: "10mb" }));

// Dev-only local upload fallback (see uploadController). Never active in
// production, where uploads go to Cloudinary.
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static(require("./src/controllers/uploadController").LOCAL_UPLOAD_DIR));
}
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/uploads", uploadRoutes);

// Remaining route modules (reviews, messages — Architecture.md §4) get
// mounted here as they're built.

app.use(notFound);
app.use(errorHandler);

const httpServer = http.createServer(app);
initSocket(httpServer);

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await require("./src/services/authService")
    .backfillEmailVerified()
    .catch((err) => console.error("Email-verified backfill failed:", err.message));
  await require("./src/services/vendorService")
    .backfillVerification()
    .catch((err) => console.error("Verification backfill failed:", err.message));
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  startPaymentReleaseJob();
});
