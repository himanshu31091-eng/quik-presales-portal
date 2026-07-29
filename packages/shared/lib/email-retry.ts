/**
 * FRD §7 — Invitation email delivery failure handling: retry up to 3 times,
 * notify the inviting admin if all retries fail.
 *
 * The "notify the admin in the dashboard" part is satisfied at the call site
 * by writing an AuditLog row with action "INVITE_EMAIL_FAILED" — the admin
 * UI can surface that row as a toast / banner.
 *
 * Retry strategy: simple linear back-off (200ms × attempt). Email APIs that
 * fail tend to fail because of network blips or transient provider 5xx; a
 * tighter loop is appropriate here than the exponential back-off you'd want
 * for upstream API rate-limits.
 */

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 200;

export interface SendWithRetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Calls `fn` up to `attempts` times. Resolves on the first success; if every
 * attempt rejects (or returns success:false), returns `{success:false}` with
 * the most recent error and the attempt count.
 *
 * `fn` may either:
 *   - resolve with `{success:true, data}` / `{success:false, error}` (Resend-style), or
 *   - throw (nodemailer-style).
 * Both are normalised into the result shape above.
 */
export async function sendWithRetry<T = unknown>(
  fn: () => Promise<{ success: boolean; data?: T; error?: unknown } | T>,
  options: { attempts?: number; backoffMs?: number; label?: string } = {}
): Promise<SendWithRetryResult<T>> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const label = options.label ?? "email";

  let lastError: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const out = await fn();
      // Resend-shaped response: { success, data, error }
      if (out && typeof out === "object" && "success" in (out as Record<string, unknown>)) {
        const r = out as { success: boolean; data?: T; error?: unknown };
        if (r.success) return { success: true, data: r.data, attempts: i };
        lastError = r.error;
      } else {
        // nodemailer-style: any non-throwing return is success.
        return { success: true, data: out as T, attempts: i };
      }
    } catch (err) {
      lastError = err;
    }
    if (i < attempts) {
      await new Promise((resolve) => setTimeout(resolve, backoff * i));
      console.warn(`[${label}] retry ${i}/${attempts - 1} after error:`, lastError);
    }
  }

  console.error(`[${label}] all ${attempts} send attempts failed; last error:`, lastError);
  return { success: false, error: lastError, attempts };
}
