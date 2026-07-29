import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth/index.ts"),
      "@quikit/auth/middleware": path.resolve(__dirname, "../../packages/auth/middleware.ts"),
      "@quikit/auth/feature-gate": path.resolve(__dirname, "../../packages/auth/feature-gate.ts"),
      "@quikit/auth/types": path.resolve(__dirname, "../../packages/auth/types.ts"),
      "@quikit/auth/session-guard": path.resolve(__dirname, "../../packages/auth/session-guard.tsx"),
      "@quikit/auth/require-admin": path.resolve(__dirname, "../../packages/auth/require-admin.ts"),
      "@quikit/auth/cache": path.resolve(__dirname, "../../packages/auth/cache.ts"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database/index.ts"),
      "@quikit/redis": path.resolve(__dirname, "../../packages/redis/index.ts"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared/index.ts"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging.ts"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry.ts"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui/index.ts"),
    },
  },
});
