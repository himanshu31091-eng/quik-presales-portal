import { defineConfig } from "vitest/config";

// Node-only service. Tests are co-located next to the source they cover (same
// layout as the standalone gateway this was ported from and as apps/quikchat).
// DB-touching tests mock `@quikit/database` via ./testdb — no live Postgres.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    // Socket.IO integration specs bind real ports; keep files serial to avoid
    // port/keyspace contention across the RedisMock singleton.
    fileParallelism: false,
    pool: "forks",
  },
});
