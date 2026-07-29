import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/docs
 *
 * Serves a Swagger UI page rendering the auto-generated combined OpenAPI 3.0
 * spec across all 5 QuikIT apps (quikit, quikscale, admin, quikvc,
 * quikinfra).
 *
 * Internal-only — gated by getServerSession. The middleware excludes the
 * `api/` prefix so this handler does its own auth.
 *
 * Why a Route Handler returning HTML (not a React page)?
 *   - Avoids adding swagger-ui-react to dependencies (~500KB).
 *   - Page is static once rendered; no React reconciliation needed.
 *   - CDN-loaded swagger-ui-dist requires `cdn.jsdelivr.net` in the CSP
 *     allowlist (apps/quikit/next.config.js already includes it).
 *
 * The spec itself is served at GET /api/docs/spec — also auth-gated.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized — sign in to view API docs" },
      { status: 401 },
    );
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>QuikIT Platform API — Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/favicon.ico" />
  <style>
    body { margin: 0; background: #fafafa; }
    .topbar { background: #1f2937; padding: 12px 24px; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .topbar h1 { margin: 0; font-size: 16px; font-weight: 600; }
    .topbar small { color: #9ca3af; font-size: 11px; margin-left: 12px; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>QuikIT Platform API <small>combined spec — 5 apps · filter by <code>app:&lt;name&gt;</code> tag to scope</small></h1>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.addEventListener("load", () => {
      window.ui = SwaggerUIBundle({
        url: "/api/docs/spec",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        tagsSorter: "alpha",
        operationsSorter: "alpha",
        docExpansion: "none",
        filter: true,
        tryItOutEnabled: false,
      });
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
