import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    // Every test file shares one MongoDB database, so running them in
    // parallel would let one file's cleanup truncate another's fixtures.
    // Within a file, tests still run in order.
    fileParallelism: false,
    // The concurrency tests deliberately fire overlapping writes and wait
    // on real round-trips; the default 5s is too tight.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
