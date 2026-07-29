/**
 * Seed the QuikLMS App + OAuthClient rows only.
 *
 * A focused counterpart to seed-oauth.ts (which seeds every app in one loop and
 * can abort mid-way on pre-existing per-app data drift). Idempotent: upserts the
 * App by slug and the OAuthClient by clientId.
 *
 * Run (dev):
 *   cd packages/database
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/quikit_dev \
 *   QUIKLMS_URL=http://localhost:3014 \
 *   QUIKLMS_OAUTH_CLIENT_SECRET=quiklms-dev-secret-change-in-prod \
 *   npx tsx prisma/seed-quiklms-oauth.ts
 *
 * In production pass QUIKLMS_URL + QUIKLMS_OAUTH_CLIENT_SECRET explicitly.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BASE = process.env.QUIKLMS_URL ?? "http://localhost:3014"; // prod-safety-allow: dev fallback (quiklms binds 3014)
const SECRET_PLAIN =
  process.env.QUIKLMS_OAUTH_CLIENT_SECRET ?? "quiklms-dev-secret-change-in-prod"; // prod-safety-allow: dev fallback

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.QUIKLMS_URL) {
    throw new Error("[seed-quiklms-oauth] QUIKLMS_URL is required in production.");
  }

  const app = await prisma.app.upsert({
    where: { slug: "quiklms" },
    update: {
      name: "QuikLMS",
      description:
        "Learning Management System — courses, batches, exams, attendance, certificates, teacher/learner portals.",
      baseUrl: BASE,
      status: "active",
    },
    create: {
      name: "QuikLMS",
      slug: "quiklms",
      description:
        "Learning Management System — courses, batches, exams, attendance, certificates, teacher/learner portals.",
      baseUrl: BASE,
      iconUrl: "/app-icons/quiklms.png",
      status: "active",
    },
  });
  console.log(`  ✅ App: ${app.name} (${app.slug}) → ${app.baseUrl}`);

  const hashedSecret = await bcrypt.hash(SECRET_PLAIN, 12);
  const redirectUris = [`${BASE}/api/auth/callback/quikit`];
  const scopes = ["openid", "profile", "email", "tenant"];

  const existing = await prisma.oAuthClient.findUnique({ where: { clientId: "quiklms" } });
  if (existing) {
    await prisma.oAuthClient.update({
      where: { clientId: "quiklms" },
      data: { appId: app.id, clientSecret: hashedSecret, redirectUris, scopes },
    });
    console.log("  ✅ OAuth client updated: quiklms");
  } else {
    await prisma.oAuthClient.create({
      data: { appId: app.id, clientId: "quiklms", clientSecret: hashedSecret, redirectUris, scopes },
    });
    console.log("  ✅ OAuth client created: quiklms");
  }
  console.log(`     Redirect URIs: ${redirectUris.join(", ")}`);
  console.log(`     Secret (plain, for .env): ${SECRET_PLAIN}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
