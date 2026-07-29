import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@quikit/database": path.resolve(__dirname, "../database"),
      "@quikit/shared/rateLimit": path.resolve(__dirname, "../shared/lib/rateLimit"),
      "@quikit/shared/pagination": path.resolve(__dirname, "../shared/lib/pagination"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../shared/lib/moduleRegistry"),
      "@quikit/shared/redisCache": path.resolve(__dirname, "../shared/lib/redisCache"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../shared/lib/apiLogging"),
      "@quikit/shared": path.resolve(__dirname, "../shared"),
    },
  },
});
