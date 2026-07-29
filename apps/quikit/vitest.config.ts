import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    root: path.resolve(__dirname),
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/tests/**",
      "**/__tests__/e2e/**",
      "**/dist/**",
    ],
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "lib/**/*.{ts,tsx}",
        "app/api/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/.next/**",
        "**/node_modules/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared/pagination": path.resolve(__dirname, "../../packages/shared/lib/pagination"),
      "@quikit/shared/rateLimit": path.resolve(__dirname, "../../packages/shared/lib/rateLimit"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry"),
      "@quikit/shared/redisCache": path.resolve(__dirname, "../../packages/shared/lib/redisCache"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging"),
      "@quikit/shared/sso-domain-server": path.resolve(__dirname, "../../packages/shared/lib/sso-domain-server"),
      "@quikit/shared/temp-password": path.resolve(__dirname, "../../packages/shared/lib/temp-password"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
