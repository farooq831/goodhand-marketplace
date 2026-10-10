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
app.use(require("compression")());

// For load balancers / uptime monitors: 200 only when the database is up.
app.get("/api/health", (req, res) => {
  const dbUp = require("mongoose").connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down", uptime: Math.round(process.uptime()) });
});

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
app.use(require("./src/middleware/sanitizeRequest"));

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

// Refuse to start with configuration that would be unsafe: a blank or
// placeholder JWT secret lets anyone forge a login token.
function assertSafeConfig() {
  const problems = [];
  if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is not set");
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = process.env[key] || "";
    if (!value) problems.push(`${key} is not set`);
    else if (process.env.NODE_ENV === "production" && (value.length < 32 || /replace|change|secret|example/i.test(value))) {
      problems.push(`${key} looks like a placeholder — use at least 32 random characters`);
    }
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  }
  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_URL) problems.push("CLIENT_URL is not set (CORS would block the website)");
  if (problems.length) {
    console.error(`Refusing to start:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
}
assertSafeConfig();

// Scheduled jobs (escrow release, auto-complete, reminders) should run on
// exactly one instance once the API is scaled horizontally. Set
// RUN_JOBS=false on every instance but one.
const RUN_JOBS = process.env.RUN_JOBS !== "false";

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
  if (RUN_JOBS) {
    startPaymentReleaseJob();
    require("./src/jobs/bookingReminders").startBookingReminderJob();
  }
});

// Graceful shutdown: hosts send SIGTERM on every deploy. Stop accepting new
// connections, let in-flight requests finish, then close the database.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully`);
  httpServer.close(() => {
    require("mongoose").connection.close(false).finally(() => process.exit(0));
  });
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
