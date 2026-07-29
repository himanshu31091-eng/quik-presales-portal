import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * GET /api/docs/spec
 *
 * Returns the combined OpenAPI 3.0 YAML for all QuikIT apps. Internal-only —
 * auth-checked. Loaded by the Swagger UI page at /api/docs.
 *
 * The spec lives at apps/quikit/lib/openapi.yaml — committed (so it ships
 * with deploys) but NOT in /public (so it's not served unauthenticated).
 *
 * Regenerate with:
 *   python3 _internal/api-contract-tools/build_openapi_spec.py \
 *     > apps/quikit/lib/openapi.yaml
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const path = join(process.cwd(), "apps", "quikit", "lib", "openapi.yaml");
    // In the deployed Vercel layout the cwd may already be apps/quikit, so try a fallback.
    let yaml: string;
    try {
      yaml = await readFile(path, "utf-8");
    } catch {
      const fallback = join(process.cwd(), "lib", "openapi.yaml");
      yaml = await readFile(fallback, "utf-8");
    }

    // Inject `servers:` block at runtime from env. Committed YAML has no
    // localhost — local dev gets URLs from .env.local, prod gets them from
    // Vercel env. This satisfies the prod-safety gate (no localhost in source)
    // while keeping local dev fully functional.
    const servers = [
      { url: process.env.QUIKIT_URL, label: "quikit" },
      { url: process.env.QUIKSCALE_URL, label: "quikscale" },
      { url: process.env.ADMIN_URL, label: "admin" },
      { url: process.env.QUIKVC_URL, label: "quikvc" },
      { url: process.env.QUIKINFRA_URL, label: "quikinfra" },
    ].filter((s): s is { url: string; label: string } => Boolean(s.url));

    if (servers.length > 0) {
      const env =
        process.env.NODE_ENV === "production" ? "Production" : "Local dev";
      const block = [
        "servers:",
        ...servers.flatMap((s) => [
          `  - url: ${s.url}`,
          `    description: "${s.label} — ${env}"`,
        ]),
      ].join("\n");
      yaml = yaml.replace(/^servers:\s*\[\s*\]\s*$/m, block);
    }

    return new NextResponse(yaml, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        // Hint browsers + Swagger UI: don't cache during active dev.
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to read OpenAPI spec";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
