import { build } from "esbuild";

/**
 * Production build for the realtime gateway.
 *
 * Why esbuild (not `tsc`): `@quikit/database` is a TypeScript workspace package
 * (its `main`/`types` point at `index.ts`). Next.js apps consume it through a
 * bundler and the DB seeds run via `tsx`, but `node dist/index.js` cannot
 * `require()` a `.ts` file. So we bundle: the workspace `@quikit/*` sources are
 * inlined, and every npm dependency stays external (resolved from node_modules
 * at runtime — including the native `@prisma/client` engine and pino's
 * transport worker files, which must NOT be bundled). No tsx at runtime.
 */
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  plugins: [
    {
      name: "externalize-npm-deps",
      setup(b) {
        // Bare imports are external EXCEPT our workspace `@quikit/*` packages,
        // whose `.ts` sources must be bundled (node can't require them).
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("@quikit/")) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
