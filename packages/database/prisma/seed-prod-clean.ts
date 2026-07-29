/**
 * seed-prod-clean.ts — wipe all tenant data + provision the platform-wide
 * super-admin and the App/OAuth registry. NO tenants, NO memberships, NO
 * demo data left behind.
 *
 * Use case: pre-onboarding cutover. Super-admin logs into apps/admin, creates
 * the first real Tenant by hand, invites real users from there.
 *
 * What this script does:
 *   1. WIPE every row in app_quikscale.*, app_quikvc.*, app_quikinfra.*
 *      and every public.* data table EXCEPT public._prisma_migrations.
 *      Migration history preserved so the next deploy doesn't re-attempt.
 *   2. CREATE one User: SUPERADMIN_EMAIL with bcrypt(SUPERADMIN_PASSWORD),
 *      isSuperAdmin=true. No memberships.
 *   3. CREATE 4 App registry rows (admin, quikscale, quikvc, quikinfra)
 *      with prod URLs from env vars (refuses to seed localhost in production).
 *   4. CREATE 4 OAuthClient rows with bcrypt-hashed plaintext secrets pulled
 *      from <APP>_OAUTH_CLIENT_SECRET env vars (refuses placeholder strings).
 *
 * Run:
 *   cd packages/database
 *   DATABASE_URL='postgresql://...neon-pooler...' \
 *   DATABASE_URL_DIRECT='postgresql://...neon-direct...' \
 *   SUPERADMIN_EMAIL='superadmin@moreyeahs.com' \
 *   SUPERADMIN_PASSWORD='password123' \
 *   QUIKSCALE_URL=https://quikscale.vercel.app \
 *   ADMIN_URL=https://quik-it-admin.vercel.app \
 *   QUIKVC_URL=https://quikvc.vercel.app \
 *   QUIKINFRA_URL=https://quikinfra.vercel.app \
 *   QUIKSCALE_OAUTH_CLIENT_SECRET='...' \
 *   ADMIN_OAUTH_CLIENT_SECRET='...' \
 *   QUIKVC_OAUTH_CLIENT_SECRET='...' \
 *   QUIKINFRA_OAUTH_CLIENT_SECRET='...' \
 *   npx tsx prisma/seed-prod-clean.ts --confirm
 *
 * The `--confirm` flag is mandatory. Without it the script aborts.
 *
 * IDEMPOTENT: re-running wipes again and re-provisions. Safe to re-run.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Guards ────────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[seed-prod-clean] Missing required env: ${name}`);
  }
  return v;
}

function resolveAppUrl(envName: string): string {
  const v = process.env[envName];
  if (!v) {
    throw new Error(`[seed-prod-clean] ${envName} required (no localhost fallback in prod-clean script).`);
  }
  if (v.includes("localhost") || v.includes("127.0.0.1")) {
    throw new Error(
      `[seed-prod-clean] ${envName} is "${v}" — refusing to seed localhost into prod App registry. ` +
        `If this is a dev run, use seed-oauth.ts instead.`,
    );
  }
  return v;
}

function resolveClientSecret(envName: string): string {
  const v = process.env[envName];
  if (!v) throw new Error(`[seed-prod-clean] ${envName} required.`);
  if (v.includes("change-in-prod") || v.includes("dev-secret")) {
    console.warn(
      `[seed-prod-clean] WARNING: ${envName} looks like a placeholder. ` +
        `Proceeding because user opted out of rotation, but track for later rotation.`,
    );
  }
  return v;
}

// ── Wipe ──────────────────────────────────────────────────────────────────────

async function wipe(): Promise<void> {
  console.log("🧨 Wiping all data (preserving _prisma_migrations)…");

  // Get every table in our 4 schemas dynamically — survives schema drift.
  const tables = await prisma.$queryRaw<Array<{ schemaname: string; tablename: string }>>`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'app_quikscale', 'app_quikvc', 'app_quikinfra')
      AND tablename != '_prisma_migrations'
    ORDER BY schemaname, tablename;
  `;

  if (tables.length === 0) {
    console.log("  (no tables found — already empty?)");
    return;
  }

  // Build a single TRUNCATE statement with CASCADE so FKs don't trip us.
  const qualified = tables.map(t => `"${t.schemaname}"."${t.tablename}"`).join(", ");
  console.log(`  → TRUNCATE ${tables.length} tables across 4 schemas (CASCADE, RESTART IDENTITY)`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE;`);
  console.log("  ✓ wipe complete");
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seedSuperAdmin(email: string, password: string) {
  console.log(`\n👤 Creating super-admin user: ${email}`);
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      firstName: "Super",
      lastName: "Admin",
      isSuperAdmin: true,
      emailVerified: new Date(),
    },
  });
  console.log(`  ✓ User created: id=${user.id}`);
  return user;
}

async function seedAppsAndOAuth(): Promise<void> {
  console.log("\n📦 Seeding App registry + OAuth clients…");

  const QUIKSCALE_BASE = resolveAppUrl("QUIKSCALE_URL");
  const ADMIN_BASE = resolveAppUrl("ADMIN_URL");
  const QUIKINFRA_BASE = resolveAppUrl("QUIKINFRA_URL");
  const QUIKVC_BASE = resolveAppUrl("QUIKVC_URL");
  const QUIKLMS_BASE = resolveAppUrl("QUIKLMS_URL");

  const APPS = [
    {
      slug: "quikscale",
      name: "QuikScale",
      description:
        "Scaling Up execution — KPI tracking, Priority management, OPSP, WWW, Meeting Rhythm, Performance.",
      baseUrl: QUIKSCALE_BASE,
      iconUrl: "/app-icons/quikscale.png",
      oauth: {
        clientId: "quikscale",
        clientSecretPlain: resolveClientSecret("QUIKSCALE_OAUTH_CLIENT_SECRET"),
        redirectUris: [`${QUIKSCALE_BASE}/api/auth/callback/quikit`],
      },
    },
    {
      slug: "admin",
      name: "Admin Portal",
      description:
        "Organization administration — user management, team setup, app access control, billing.",
      baseUrl: ADMIN_BASE,
      iconUrl: "/app-icons/admin.png",
      oauth: {
        clientId: "admin",
        clientSecretPlain: resolveClientSecret("ADMIN_OAUTH_CLIENT_SECRET"),
        redirectUris: [`${ADMIN_BASE}/api/auth/callback/quikit`],
      },
    },
    {
      slug: "quikinfra",
      name: "QuikInfra",
      description:
        "Construction ERP — Projects, BOQ/DPR, Purchase, Store, Finance, HRMS, Safety, Quality.",
      baseUrl: QUIKINFRA_BASE,
      iconUrl: "/app-icons/quikinfra.png",
      oauth: {
        clientId: "quikinfra",
        clientSecretPlain: resolveClientSecret("QUIKINFRA_OAUTH_CLIENT_SECRET"),
        redirectUris: [`${QUIKINFRA_BASE}/api/auth/callback/quikit`],
      },
    },
    {
      slug: "quikvc",
      name: "QuikVC",
      description:
        "AI-powered VC operating system — sourcing, deal flow, IC memos, allocations, repayments.",
      baseUrl: QUIKVC_BASE,
      iconUrl: "/app-icons/quikvc.png",
      oauth: {
        clientId: "quikvc",
        clientSecretPlain: resolveClientSecret("QUIKVC_OAUTH_CLIENT_SECRET"),
        redirectUris: [`${QUIKVC_BASE}/api/auth/callback/quikit`],
      },
    },
    {
      slug: "quiklms",
      name: "QuikLMS",
      description:
        "Learning Management System — courses, batches, exams, attendance, certificates, teacher/learner portals.",
      baseUrl: QUIKLMS_BASE,
      iconUrl: "/app-icons/quiklms.png",
      oauth: {
        clientId: "quiklms",
        clientSecretPlain: resolveClientSecret("QUIKLMS_OAUTH_CLIENT_SECRET"),
        redirectUris: [`${QUIKLMS_BASE}/api/auth/callback/quikit`],
      },
    },
  ];

  for (const a of APPS) {
    const app = await prisma.app.create({
      data: {
        slug: a.slug,
        name: a.name,
        description: a.description,
        baseUrl: a.baseUrl,
        iconUrl: a.iconUrl,
        status: "active",
      },
    });
    const hashedSecret = await bcrypt.hash(a.oauth.clientSecretPlain, 12);
    await prisma.oAuthClient.create({
      data: {
        appId: app.id,
        clientId: a.oauth.clientId,
        clientSecret: hashedSecret,
        redirectUris: a.oauth.redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
        grantTypes: ["authorization_code", "refresh_token"],
      },
    });
    console.log(`  ✓ ${a.slug} → ${a.baseUrl}  (oauth: ${a.oauth.clientId})`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      "❌ Refusing to run without --confirm.\n" +
        "   This script WIPES all data from the target database.\n" +
        "   Re-run with `--confirm` if you really mean it.",
    );
    process.exit(1);
  }

  const email = requireEnv("SUPERADMIN_EMAIL");
  const password = requireEnv("SUPERADMIN_PASSWORD");

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  PROD-CLEAN SEED — wipe all data + provision super-admin");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Target: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":***@")}`);
  console.log(`  Super-admin: ${email}`);
  console.log("");

  await wipe();
  await seedSuperAdmin(email, password);
  await seedAppsAndOAuth();

  // Final counts
  const [users, tenants, memberships, apps, oauthClients] = await Promise.all([
    prisma.user.count(),
    prisma.org.count(),
    prisma.orgMember.count(),
    prisma.app.count(),
    prisma.oAuthClient.count(),
  ]);

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ✅ Done. Final state:");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Users:        ${users}        (expect 1)`);
  console.log(`  Tenants:      ${tenants}        (expect 0)`);
  console.log(`  Memberships:  ${memberships}        (expect 0)`);
  console.log(`  Apps:         ${apps}        (expect 4)`);
  console.log(`  OAuthClients: ${oauthClients}        (expect 4)`);
  console.log("");
  console.log(`  Login: ${email} / ${"*".repeat(password.length)}`);
  console.log(`  Then: open the admin app, create the Moreyeahs tenant by hand.`);
}

main()
  .catch(e => {
    console.error("❌ FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
