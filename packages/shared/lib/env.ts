/**
 * Env-var helpers that fail loud in prod instead of silently defaulting to
 * localhost.
 *
 * Rationale: silent `process.env.X || "http://localhost:..."` fallbacks are
 * the #1 source of "works in dev, breaks in prod" URL bugs. We centralise
 * the prod-safe pattern here so every app uses the same shape.
 *
 * Usage:
 *   const APP_URL = requireProdEnv("APP_URL", "http://localhost:3001");
 *   // In production, throws if APP_URL is unset.
 *   // In dev / test, returns the fallback.
 *
 *   const base = requireEnv("NEXTAUTH_URL");
 *   // Throws in every environment if missing.
 */

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Returns `process.env[name]`. In production, throws if unset. In dev / test,
 * returns the provided `devFallback` (or throws if no fallback and unset).
 *
 * Implementation note: webpack's DefinePlugin can only statically replace
 * `process.env.NEXT_PUBLIC_X` (literal member access), NOT
 * `process.env[varName]` (dynamic). For client components to read these
 * values at runtime in the browser, each known name needs LITERAL access
 * so webpack inlines the build-time value into the bundle. Hence the
 * explicit switch instead of the previous one-liner `process.env[name]`.
 *
 * The default branch keeps dynamic behavior for any var name not
 * enumerated — that path still works server-side (Node has process.env
 * at runtime) but will return undefined in the browser.
 */
export function requireProdEnv(name: string, devFallback?: string): string {
  let v: string | undefined;
  switch (name) {
    // NEXT_PUBLIC_* — literal access required so webpack inlines values
    // into client bundles.
    case "NEXT_PUBLIC_LAUNCHER_URL":
      v = process.env.NEXT_PUBLIC_LAUNCHER_URL;
      break;
    case "NEXT_PUBLIC_AUTH_URL":
      v = process.env.NEXT_PUBLIC_AUTH_URL;
      break;
    case "NEXT_PUBLIC_QUIKIT_URL":
      v = process.env.NEXT_PUBLIC_QUIKIT_URL;
      break;
    case "NEXT_PUBLIC_ADMIN_URL":
      v = process.env.NEXT_PUBLIC_ADMIN_URL;
      break;
    case "NEXT_PUBLIC_LOGIN_URL":
      v = process.env.NEXT_PUBLIC_LOGIN_URL;
      break;
    case "NEXT_PUBLIC_SUPER_ADMIN_URL":
      v = process.env.NEXT_PUBLIC_SUPER_ADMIN_URL;
      break;
    case "NEXT_PUBLIC_QUIKSCALE_URL":
      v = process.env.NEXT_PUBLIC_QUIKSCALE_URL;
      break;
    // Server-only names — these still read at runtime fine via Node's
    // process.env. Listed explicitly so all known names go through the
    // same switch shape.
    case "NEXTAUTH_URL":
      v = process.env.NEXTAUTH_URL;
      break;
    case "QUIKIT_URL":
      v = process.env.QUIKIT_URL;
      break;
    default:
      // Fallback for any future name. Works server-side; client-side
      // dynamic access returns undefined and triggers the prod-required
      // throw below.
      v = process.env[name];
  }
  if (v) return v;
  if (isProd()) {
    throw new Error(
      `[env] ${name} is required in production. Set it on the Vercel project ` +
        `before this code path is hit.`,
    );
  }
  if (devFallback !== undefined) return devFallback;
  throw new Error(
    `[env] ${name} is not set. In dev you can export a value or add it to .env.local.`,
  );
}

/**
 * Returns `process.env[name]` or throws regardless of environment.
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v) return v;
  throw new Error(`[env] ${name} is required.`);
}
