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
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
