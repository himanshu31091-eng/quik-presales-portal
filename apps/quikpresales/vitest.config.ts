import { defineConfig } from "vitest/config";
import path from "path";

const pkg = (name: string) => path.resolve(__dirname, `../../packages/${name}`);

export default defineConfig({
  test: {
    // Default env is node. DOM tests opt in per-file with the directive
    // `// @vitest-environment jsdom` at the top of the .tsx file.
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["__tests__/e2e/**", "node_modules/**"],
    clearMocks: true,
    // Pin the timezone so any date assertion is deterministic regardless of
    // the developer's machine.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.{ts,tsx}", "app/api/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
      exclude: ["**/*.d.ts", "**/__tests__/**", "**/node_modules/**", "**/.next/**"],
    },
  },
  resolve: {
    // Array form so subpath imports resolve by pattern. quikscale enumerates
    // every `@quikit/shared/*` entry by hand; these two regexes cover any
    // subpath, so a new one doesn't need a config edit. Order matters — the
    // specific patterns must precede the bare package aliases.
    alias: [
      // `@quikit/shared/types` lives at the package root, not under lib/.
      { find: /^@quikit\/shared\/types$/, replacement: `${pkg("shared")}/types` },
      { find: /^@quikit\/shared\/(.*)$/, replacement: `${pkg("shared")}/lib/$1` },
      { find: /^@quikit\/auth\/(.*)$/, replacement: `${pkg("auth")}/$1` },
      { find: /^@quikit\/ui\/(.*)$/, replacement: `${pkg("ui")}/$1` },
      { find: /^@quikit\/shared$/, replacement: pkg("shared") },
      { find: /^@quikit\/auth$/, replacement: pkg("auth") },
      { find: /^@quikit\/ui$/, replacement: pkg("ui") },
      { find: /^@quikit\/database$/, replacement: pkg("database") },
      { find: /^@\//, replacement: `${path.resolve(__dirname, ".")}/` },
    ],
  },
});
