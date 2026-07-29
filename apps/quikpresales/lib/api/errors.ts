/**
 * Centralized error-message extraction for route handlers.
 *
 * Route handlers use `catch (error: unknown)` per CLAUDE.md; this helper
 * narrows the unknown to a human-readable string without re-implementing the
 * pattern in every file.
 */
export function toErrorMessage(error: unknown, fallback = "Operation failed"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
