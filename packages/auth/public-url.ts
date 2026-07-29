import type { NextRequest } from "next/server";

/**
 * Resolve THIS app's own public origin for building user-facing redirects.
 *
 * Background: in the GKE deployment the Next.js standalone server binds to
 * `HOSTNAME=0.0.0.0` / `PORT=<app port>` (see each app's Dockerfile). When the
 * reverse proxy / ingress does not preserve the original `Host` header, the
 * `Host` arriving at the pod is the bind address, so `request.url` becomes
 * `http://0.0.0.0:3001/...` and every `new URL(path, request.url)` redirect
 * leaks the unreachable bind address to the browser (ERR_ADDRESS_INVALID).
 *
 * This helper never returns a bind/loopback placeholder for the host. It tries,
 * in order:
 *   1. `NEXTAUTH_URL` — this app's own canonical origin, injected at runtime.
 *      Attacker-uncontrollable, so preferred when present.
 *   2. `X-Forwarded-Host` (+ `X-Forwarded-Proto`) — the real public host when a
 *      correctly-configured ingress forwards it.
 *   3. `request.nextUrl.origin` / `request.url` — the Host header, used only
 *      when it is not a bind address.
 *   4. Raw request origin as an absolute last resort (matches pre-fix
 *      behaviour rather than 500-ing the request).
 *
 * NOTE: `NEXTAUTH_URL` must be set per-app to that app's OWN public origin
 * (e.g. `https://authn.quikit.ai` for auth, `https://scale.quikit.ai` for
 * quikscale). The consumer-app `/auth-handoff` routes set a host-only session
 * cookie and must redirect back to the SAME host that served the request — a
 * cross-host `NEXTAUTH_URL` would land the user on a host without the cookie.
 */
const BIND_HOSTS = new Set([
  "0.0.0.0",
  "::",
  "[::]",
  "0000:0000:0000:0000:0000:0000:0000:0000",
]);

function safeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = value.includes("://")
      ? new URL(value)
      : new URL(`https://${value}`);
    const host = url.hostname;
    if (!host || BIND_HOSTS.has(host)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicBaseUrl(request: NextRequest): string {
  // 1. Explicit per-app origin injected at runtime.
  const fromEnv = safeOrigin(process.env.NEXTAUTH_URL);
  if (fromEnv) return fromEnv;

  // 2. Reverse-proxy forwarded headers — the real public host even when the
  //    Host header reaching the pod is the bind address.
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const candidate = safeOrigin(`${proto}://${fwdHost.split(",")[0].trim()}`);
    if (candidate) return candidate;
  }

  // 3. Host header / request origin — only when it is not the bind address.
  const fromRequest =
    safeOrigin(request.nextUrl.origin) ?? safeOrigin(request.url);
  if (fromRequest) return fromRequest;

  // 4. Nothing usable — fall back to the raw request origin (pre-fix behaviour).
  return request.nextUrl.origin;
}

/** Build an absolute URL on this app's own public origin. */
export function publicUrl(path: string, request: NextRequest): URL {
  return new URL(path, publicBaseUrl(request));
}
