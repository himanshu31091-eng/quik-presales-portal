import pino from "pino";

/**
 * Vendored structured logger for the realtime gateway.
 *
 * The standalone gateway imported `logger` from `@quikit/shared`, but in the
 * merged monorepo `@quikit/shared` exports no logger, and the app's logger
 * (`apps/quikchat/lib/shared/logger.ts`) is app-internal and off-limits to a
 * self-contained service. So we vendor a small pino logger that matches the
 * app's style: level from `LOG_LEVEL`, silent under Vitest, secrets redacted.
 */
const isTest = !!process.env.VITEST || process.env.NODE_ENV === "test";
const level = process.env.LOG_LEVEL ?? (isTest ? "silent" : "info");

export const logger = pino({
  level,
  redact: {
    paths: ["authorization", "headers.authorization", "token", "password", "cookie", "secret"],
    censor: "[redacted]",
  },
});
