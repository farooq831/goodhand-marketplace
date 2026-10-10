const mongoose = require("mongoose");

// Architecture.md §3 `users` collection.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // null for OAuth-only accounts (Google sign-in). select:false so it
    // never comes back on a normal find — call .select("+passwordHash")
    // where it's actually needed (login).
    passwordHash: { type: String, default: null, select: false },
    googleId: { type: String, default: null },
    role: {
      type: String,
      enum: ["customer", "vendor", "admin"],
      default: "customer",
    },
    phone: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    isVerified: { type: Boolean, default: false }, // vendor verification status
    status: { type: String, enum: ["active", "suspended"], default: "active" },

    // Proof the person controls this inbox. Separate from `isVerified`
    // above, which is the admin's vendor approval.
    emailVerified: { type: Boolean, default: false },
    // Embedded in refresh tokens; bumping it (e.g. on password reset)
    // invalidates every refresh token issued before.
    tokenVersion: { type: Number, default: 0 },
    // Single-use links. Only a SHA-256 of the token is stored, so a leaked
    // database can't be used to reset anyone's password.
    emailVerifyTokenHash: { type: String, default: null, select: false },
    emailVerifyExpires: { type: Date, default: null, select: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
    // Browsers/devices this account has signed in from (auditService.trackSignIn).
    knownDevices: {
      type: [{ key: String, label: String, ip: String, firstSeenAt: Date, lastSeenAt: Date, _id: false }],
      default: [],
      select: false,
    },
  },
  { timestamps: true }
);

// notifyRole("admin", ...) and the admin user list.
userSchema.index({ role: 1, status: 1 });

const PRIVATE_FIELDS = ["passwordHash", "__v", "tokenVersion", "emailVerifyTokenHash", "emailVerifyExpires", "passwordResetTokenHash", "passwordResetExpires", "knownDevices"];

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    for (const field of PRIVATE_FIELDS) delete ret[field];
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
