#!/usr/bin/env node
/**
 * provision-quikpresales.mjs — make a fresh database usable by the deployed
 * QuikPreSales app.
 *
 * Creates, in dependency order: an Org, an admin User, their OrgMember, the
 * `App` registry row, an OAuthClient, OrgAppAccess + UserAppAccess, and one demo
 * engagement so the dashboard renders with real shape instead of every panel
 * reading "no data". The per-app RBAC roles are seeded by the app itself on the
 * first authenticated request (`seedAllDefaultRoles`), which needs the `App` row
 * to exist first — hence this ordering.
 *
 * Idempotent. Every write is an upsert or existence-guarded, so re-running is
 * safe. A password is set only when the user is created, so re-running never
 * resets one somebody has since changed.
 *
 * Why this exists as a script rather than a seed in packages/database: app teams
 * do not edit packages/**, and this provisions one app's registration rather than
 * the whole platform.
 *
 * Usage:
 *   DATABASE_URL=… DATABASE_URL_DIRECT=… SEED_ADMIN_PASSWORD=… \
 *     node scripts/provision-quikpresales.mjs <appBaseUrl>
 *
 * Env:
 *   SEED_ADMIN_EMAIL     defaults to himanshu.pandey@moreyeahs.com
 *   SEED_ADMIN_PASSWORD  required — the script refuses to create a
 *                        password-less account
 *   SEED_ORG_NAME        defaults to MoreYeahs
 *
 * Prints no secrets. Exits 0 when there is nothing to do.
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", "package.json"));

const appBaseUrl = process.argv[2];
if (!appBaseUrl) {
  console.error("usage: node scripts/provision-quikpresales.mjs <appBaseUrl>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("provision: DATABASE_URL is not set");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "himanshu.pandey@moreyeahs.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const ORG_NAME = process.env.SEED_ORG_NAME ?? "MoreYeahs";
const ORG_SLUG = ORG_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-");

if (!ADMIN_PASSWORD) {
  console.error("provision: SEED_ADMIN_PASSWORD is not set — refusing to create an account without a password");
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const db = new PrismaClient();

const log = (...a) => console.log("provision:", ...a);

try {
  const org = await db.org.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: { name: ORG_NAME, slug: ORG_SLUG, status: "active", industry: "IT Services" },
    select: { id: true, name: true },
  });
  log(`org ${org.name}`);

  const user = await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      firstName: ADMIN_EMAIL.split("@")[0].split(".")[0] || "Admin",
      lastName: "User",
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      emailVerified: new Date(),
      isSuperAdmin: true,
    },
    select: { id: true, email: true, password: true },
  });
  log(`user ${user.email} (password ${user.password ? "present" : "MISSING"})`);

  const member = await db.orgMember.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { id: true },
  });
  if (member) {
    await db.orgMember.update({
      where: { id: member.id },
      data: { role: "org_admin", status: "active" },
    });
  } else {
    await db.orgMember.create({
      data: {
        orgId: org.id,
        userId: user.id,
        role: "org_admin",
        status: "active",
        acceptedAt: new Date(),
      },
    });
  }
  log("membership org_admin/active");

  const app = await db.app.upsert({
    where: { slug: "quikpresales" },
    update: { baseUrl: appBaseUrl, status: "active" },
    create: {
      slug: "quikpresales",
      name: "QuikPreSales",
      description: "AI-assisted pre-sales: RFPs, proposals, demos and win/loss analysis",
      baseUrl: appBaseUrl,
      status: "active",
    },
    select: { id: true },
  });
  log(`app quikpresales -> ${appBaseUrl}`);

  const client = await db.oAuthClient.findUnique({
    where: { appId: app.id },
    select: { id: true },
  });
  if (!client) {
    await db.oAuthClient.create({
      data: {
        appId: app.id,
        clientId: "quikpresales",
        clientSecret: randomBytes(32).toString("hex"),
        redirectUris: [`${appBaseUrl}/api/auth/callback/quikit`],
      },
    });
    log("oauth client created (secret not printed — rotate via the admin UI if SSO is wired)");
  } else {
    log("oauth client already present, untouched");
  }

  const orgAccess = await db.orgAppAccess.findFirst({
    where: { orgId: org.id, appId: app.id },
    select: { id: true },
  });
  if (orgAccess) {
    await db.orgAppAccess.update({ where: { id: orgAccess.id }, data: { enabled: true } });
  } else {
    await db.orgAppAccess.create({ data: { orgId: org.id, appId: app.id, enabled: true } });
  }

  const userAccess = await db.userAppAccess.findFirst({
    where: { userId: user.id, orgId: org.id, appId: app.id },
    select: { id: true },
  });
  if (userAccess) {
    await db.userAppAccess.update({ where: { id: userAccess.id }, data: { role: "admin" } });
  } else {
    await db.userAppAccess.create({
      data: { userId: user.id, orgId: org.id, appId: app.id, role: "admin" },
    });
  }
  log("access: org enabled, user role=admin");

  const demoTitle = "Acme Manufacturing — ERP modernisation";
  const existing = await db.psEngagement.findFirst({
    where: { orgId: org.id, title: demoTitle },
    select: { id: true },
  });
  if (existing) {
    log("demo engagement already present");
  } else {
    await db.psEngagement.create({
      data: {
        orgId: org.id,
        title: demoTitle,
        industry: "Manufacturing",
        territory: "India",
        stage: "solution-design",
        closedStatus: "open",
        // Paise, per the PsEngagement contract.
        estRevenue: BigInt(45_000_000),
        currency: "INR",
        probability: 35,
        competitors: ["Infosys", "TCS"],
        techStack: ["Dynamics365", "AzureAI"],
        expectedClose: new Date(Date.now() + 45 * 86_400_000),
        daysInStage: 12,
        createdBy: user.id,
      },
    });
    log(`demo engagement seeded`);
  }

  log("complete");
} catch (e) {
  console.error("provision FAILED:", String(e.message).split("\n")[0]);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
