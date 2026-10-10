const mongoose = require("mongoose");

/**
 * Connects to MongoDB using MONGODB_URI from the environment.
 * Logs and exits the process on failure so a missing/bad DB never
 * fails silently once real routes start depending on it.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("MONGODB_URI is not set. Add it to .env");
    process.exit(1);
  }

  try {
    // A bounded pool and timeouts so a slow database fails fast instead of
    // piling up requests.
    await mongoose.connect(uri, { maxPoolSize: Number(process.env.MONGODB_POOL_SIZE || 20), serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
