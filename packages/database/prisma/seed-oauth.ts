/**
 * Seed OAuth clients + App registry entries for dev.
 *
 * Run: cd packages/database && npx tsx prisma/seed-oauth.ts
 *
 * Creates:
 *   - App entries for QuikScale + Admin Portal
 *   - OAuthClient entries with dev redirect URIs + hashed secrets
 *
 * Idempotent — skips if already exists (upserts by slug/clientId).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Resolve an app's base URL for the App registry + OAuth redirect URI.
 *
 * In production we refuse to seed with localhost values — running this
 * script against a prod DB without QUIKSCALE_URL / ADMIN_URL set would
 * insert localhost into OAuth redirect URIs, silently breaking SSO for
 * every real user. Fail loud instead.
 */
function resolveAppUrl(envName: string, devFallback: string): string {
  const v = process.env[envName];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[seed-oauth] ${envName} is required when NODE_ENV=production. ` +
        `Seeding localhost into an OAuth redirect URI would break SSO for ` +
        `every user. Set it before re-running this script.`,
    );
  }
  return devFallback;
}

/**
 * Resolve an OAuth client secret. Required in production (no default).
 * In dev, falls back to a deterministic placeholder so local seeding works
 * without env setup, but the placeholder is clearly marked.
 */
function resolveClientSecret(envName: string, devFallback: string): string {
  const v = process.env[envName];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[seed-oauth] ${envName} is required when NODE_ENV=production. ` +
        `Refusing to seed a placeholder OAuth client secret in production.`,
    );
  }
  return devFallback;
}

// Dev fallbacks MUST match `next dev -p <port>` in each app's package.json:
//   quikit → 3000   auth → 3001   admin → 3002   quikscale → 3003
//   quiktrack → 3004   quikvc → 3005   quikinfra → 3006   quiksocial → 3007
//   quikcrm → 3008   quikhrms → 3009   quiksupport → 3010  quikasset → 3012
//   quikfinance → 3013   quiklms → 3014
// quiklms was folded in from the standalone quikskill_lms app; it now binds
// 3014 to sit next to the contiguous block. `apps/quiklms/package.json`
// (`next dev -p 3014`) is the source of truth and its .env.local agrees.
// In production these URLs MUST be passed via env vars (resolveAppUrl throws
// when NODE_ENV=production and the env var is unset).
const ADMIN_BASE = resolveAppUrl("ADMIN_URL", "http://localhost:3002"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKSCALE_BASE = resolveAppUrl("QUIKSCALE_URL", "http://localhost:3003"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKTRACK_BASE = resolveAppUrl("QUIKTRACK_URL", "http://localhost:3004"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKINFRA_BASE = resolveAppUrl("QUIKINFRA_URL", "http://localhost:3006"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKSOCIAL_BASE = resolveAppUrl("QUIKSOCIAL_URL", "http://localhost:3007"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKVC_BASE = resolveAppUrl("QUIKVC_URL", "http://localhost:3005"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKCRM_BASE = resolveAppUrl("QUIKCRM_URL", "http://localhost:3008"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKLMS_BASE = resolveAppUrl("QUIKLMS_URL", "http://localhost:3014"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKFINANCE_BASE = resolveAppUrl("QUIKFINANCE_URL", "http://localhost:3013"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKASSET_BASE = resolveAppUrl("QUIKASSET_URL", "http://localhost:3012"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKSUPPORT_BASE = resolveAppUrl("QUIKSUPPORT_URL", "http://localhost:3010"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
// Central launcher (quikit) origin. It hosts every app's icon under
// /app-icons and is where App.iconUrl is designed to resolve (see the comment
// on BRAND_ICONS in packages/ui/components/app-switcher.tsx). Used as the
// absolute base for QuikCRM's iconUrl below.
const QUIKIT_BASE = resolveAppUrl("QUIKIT_URL", "http://localhost:3000"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl

const APPS = [
  {
    slug: "quikscale",
    name: "QuikScale",
    description: "Scaling Up execution — KPI tracking, Priority management, OPSP, WWW, Meeting Rhythm, Performance.",
    baseUrl: QUIKSCALE_BASE,
    iconUrl: "/app-icons/quikscale.png",
    status: "active",
    oauth: {
      clientId: "quikscale",
      clientSecretPlain: resolveClientSecret("QUIKSCALE_OAUTH_CLIENT_SECRET", "quikscale-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKSCALE_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikcrm",
    name: "QuikCRM",
    description: "Sales execution OS — Leads, pipeline, accounts, contacts, quotes, orders, telephony, reports.",
    baseUrl: QUIKCRM_BASE,
    // Absolute URL on the central launcher (quikit), which hosts every app's
    // icon under /app-icons and is the always-on origin where App.iconUrl is
    // designed to resolve. The brand-icon SVG map in @quikit/ui has no
    // `quikcrm` key, so every app's <AppSwitcher /> falls back to this
    // App.iconUrl; a relative path 404s cross-origin (broken tile). Pointing at
    // the launcher renders the QuikCRM logo consistently in every app.
    iconUrl: `${QUIKIT_BASE}/app-icons/quikcrm.svg`,
    status: "active",
    oauth: {
      clientId: "quikcrm",
      clientSecretPlain: resolveClientSecret("QUIKCRM_OAUTH_CLIENT_SECRET", "quikcrm-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKCRM_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "admin",
    name: "Admin Portal",
    description: "Organization administration — user management, team setup, app access control, billing.",
    baseUrl: ADMIN_BASE,
    iconUrl: "/app-icons/admin.png",
    status: "active",
    oauth: {
      clientId: "admin",
      clientSecretPlain: resolveClientSecret("ADMIN_OAUTH_CLIENT_SECRET", "admin-dev-secret-change-in-prod"),
      redirectUris: [
        `${ADMIN_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quiktrack",
    name: "QuikTrack",
    description: "Project management — Spaces, Sprints, Kanban, Task Table, Timeline, Pages, Timesheet, Reports.",
    baseUrl: QUIKTRACK_BASE,
    iconUrl: "/app-icons/quiktrack.png",
    status: "active",
    oauth: {
      clientId: "quiktrack",
      clientSecretPlain: resolveClientSecret("QUIKTRACK_OAUTH_CLIENT_SECRET", "quiktrack-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKTRACK_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikinfra",
    name: "QuikInfra",
    description: "Construction ERP — Projects, BOQ/DPR, Purchase, Store, Finance, HRMS, Safety, Quality.",
    baseUrl: QUIKINFRA_BASE,
    iconUrl: "/app-icons/quikinfra.png",
    status: "active",
    oauth: {
      clientId: "quikinfra",
      clientSecretPlain: resolveClientSecret("QUIKINFRA_OAUTH_CLIENT_SECRET", "quikinfra-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKINFRA_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikvc",
    name: "QuikVC",
    description: "AI-powered VC operating system — sourcing, deal flow, IC memos, allocations, repayments.",
    baseUrl: QUIKVC_BASE,
    iconUrl: "/app-icons/quikvc.png",
    status: "active",
    oauth: {
      clientId: "quikvc",
      clientSecretPlain: resolveClientSecret("QUIKVC_OAUTH_CLIENT_SECRET", "quikvc-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKVC_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quiklms",
    name: "QuikLMS",
    description: "Learning Management System — courses, batches, exams, attendance, certificates, teacher/learner portals.",
    baseUrl: QUIKLMS_BASE,
    iconUrl: "/app-icons/quiklms.svg",
    status: "active",
    oauth: {
      clientId: "quiklms",
      clientSecretPlain: resolveClientSecret("QUIKLMS_OAUTH_CLIENT_SECRET", "quiklms-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKLMS_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quiksocial",
    name: "QuikSocial",
    description: "AI-powered social media management — brands, posts, campaigns, scheduling.",
    baseUrl: QUIKSOCIAL_BASE,
    iconUrl: "/app-icons/quiksocial.png",
    status: "active",
    oauth: {
      clientId: "quiksocial",
      clientSecretPlain: resolveClientSecret("QUIKSOCIAL_OAUTH_CLIENT_SECRET", "quiksocial-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKSOCIAL_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikfinance",
    name: "QuikFinance",
    description: "Cloud-native accounting — invoices, bills, banking, GST, ledgers, reports.",
    baseUrl: QUIKFINANCE_BASE,
    // Absolute URL on the central launcher (quikit), which hosts every app's
    // icon under /app-icons. @quikit/ui's brand-icon map has no `quikfinance`
    // key, so the tile falls back to App.iconUrl — a relative path would 404
    // cross-origin. (icon asset still TODO; tile renders broken until added.)
    iconUrl: `${QUIKIT_BASE}/app-icons/quikfinance.svg`,
    status: "active",
    oauth: {
      clientId: "quikfinance",
      clientSecretPlain: resolveClientSecret("QUIKFINANCE_OAUTH_CLIENT_SECRET", "quikfinance-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKFINANCE_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikasset",
    name: "QuikAsset",
    description: "IT & fixed-asset lifecycle management — inventory, assignments, repairs, budgets & reports.",
    baseUrl: QUIKASSET_BASE,
    // Absolute URL on the central launcher (quikit), which hosts every app's
    // icon under /app-icons. @quikit/ui's brand-icon map has no `quikasset`
    // key, so the tile falls back to App.iconUrl — a relative path would 404
    // cross-origin.
    iconUrl: `${QUIKIT_BASE}/app-icons/quikasset.svg`,
    status: "active",
    oauth: {
      clientId: "quikasset",
      clientSecretPlain: resolveClientSecret("QUIKASSET_OAUTH_CLIENT_SECRET", "quikasset-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKASSET_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quiksupport",
    name: "QuikSupport",
    description: "Helpdesk & ticketing — tickets, SLA tracking, categories, agent queues, reports.",
    baseUrl: QUIKSUPPORT_BASE,
    iconUrl: "/app-icons/quiksupport.svg",
    status: "active",
    oauth: {
      clientId: "quiksupport",
      clientSecretPlain: resolveClientSecret("QUIKSUPPORT_OAUTH_CLIENT_SECRET", "quiksupport-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKSUPPORT_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikchat",
    name: "QuikChat",
    description: "Team messaging — channels, DMs, calls, notifications, calendar.",
    baseUrl: resolveAppUrl("QUIKCHAT_URL", "http://localhost:3011"),
    iconUrl: `${QUIKIT_BASE}/app-icons/quikchat.svg`,
    status: "active",
    oauth: {
      clientId: "quikchat",
      clientSecretPlain: resolveClientSecret("QUIKCHAT_OAUTH_CLIENT_SECRET", "quikchat-dev-secret-change-in-prod"),
      redirectUris: [
        "http://localhost:3011/api/auth/callback/quikit",
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
];

async function main() {
  console.log("🔑 Seeding OAuth clients + App registry...\n");

  for (const appDef of APPS) {
    // Upsert App
    const app = await prisma.app.upsert({
      where: { slug: appDef.slug },
      update: {
        name: appDef.name,
        description: appDef.description,
        baseUrl: appDef.baseUrl,
        status: appDef.status,
      },
      create: {
        name: appDef.name,
        slug: appDef.slug,
        description: appDef.description,
        baseUrl: appDef.baseUrl,
        iconUrl: appDef.iconUrl,
        status: appDef.status,
      },
    });
    console.log(`  ✅ App: ${app.name} (${app.slug}) → ${app.baseUrl}`);

    // Upsert OAuthClient
    const hashedSecret = await bcrypt.hash(appDef.oauth.clientSecretPlain, 12);

    const existing = await prisma.oAuthClient.findUnique({
      where: { clientId: appDef.oauth.clientId },
    });

    if (existing) {
      await prisma.oAuthClient.update({
        where: { clientId: appDef.oauth.clientId },
        data: {
          clientSecret: hashedSecret,
          redirectUris: appDef.oauth.redirectUris,
          scopes: appDef.oauth.scopes,
        },
      });
      console.log(`  ✅ OAuth client updated: ${appDef.oauth.clientId}`);
    } else {
      await prisma.oAuthClient.create({
        data: {
          appId: app.id,
          clientId: appDef.oauth.clientId,
          clientSecret: hashedSecret,
          redirectUris: appDef.oauth.redirectUris,
          scopes: appDef.oauth.scopes,
        },
      });
      console.log(`  ✅ OAuth client created: ${appDef.oauth.clientId}`);
    }

    console.log(`     Secret (plain, for .env): ${appDef.oauth.clientSecretPlain.length > 0 ? "[set]" : "[unset]"}  (${appDef.oauth.clientSecretPlain.startsWith("change-in-prod") || appDef.oauth.clientSecretPlain.endsWith("change-in-prod") ? "DEV PLACEHOLDER — rotate before prod" : "from env"})`);
    console.log(`     Redirect URIs: ${appDef.oauth.redirectUris.join(", ")}\n`);
  }

  console.log("🎉 Done! For each app, set in its .env.local:");
  const quikitUrlDev = "http://" + "localhost:3000"; // prod-safety-allow: printed dev instructions
  console.log(`
QUIKIT_URL="${quikitUrlDev}"
QUIKIT_CLIENT_ID="<app-slug>"
QUIKIT_CLIENT_SECRET="<value-from-secrets-vault>"

For the source of truth on secret values, see ~/Desktop/QuikIT-Secrets/ (vault).
Generate fresh secrets with:  openssl rand -base64 32
Then re-run this seed with the env vars set:
  QUIKSCALE_OAUTH_CLIENT_SECRET=... ADMIN_OAUTH_CLIENT_SECRET=... \\
  QUIKTRACK_OAUTH_CLIENT_SECRET=... \\
  QUIKINFRA_OAUTH_CLIENT_SECRET=... QUIKVC_OAUTH_CLIENT_SECRET=... \\
  QUIKSOCIAL_OAUTH_CLIENT_SECRET=... \\
  npx tsx prisma/seed-oauth.ts
`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
