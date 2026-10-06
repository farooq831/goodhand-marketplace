import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

// Tests need a real MongoDB rather than an in-memory one: mongodb-memory-server's
// postinstall binary download is blocked by this repo's `allowScripts` policy,
// and nothing here needs a replica set (the concurrency fixes are deliberately
// transaction-free so they work on a standalone mongod — see bookingService).
const TEST_URI = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/lsm_test";

// Guard rail, not ceremony: afterEach() truncates every collection in whatever
// database this points at. Pointing it at the dev database by accident would
// silently destroy real data, so refuse anything not explicitly named *_test.
const dbName = new URL(TEST_URI.replace(/^mongodb:/, "http:")).pathname.slice(1);
if (!dbName || !/_test$/.test(dbName)) {
  throw new Error(
    `Refusing to run tests against database "${dbName}" — the name must end in "_test". ` +
      `Set MONGODB_TEST_URI to something like mongodb://127.0.0.1:27017/lsm_test.`
  );
}

// The services under test read these at module load. Set them before any
// import of the app code so nothing falls back to a real credential.
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.PLATFORM_COMMISSION_PERCENT = "10";
// Deliberately left unset so config/stripe.js exports null and no test can
// ever reach the real Stripe API; the escrow tests inject their own fake.
delete process.env.STRIPE_SECRET_KEY;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
});

afterEach(async () => {
  // Truncate rather than drop: dropping would also drop the indexes, and the
  // unique-index behaviour under concurrency is part of what we're testing.
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
