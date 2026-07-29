// Seeds per-app AppRole tables for the Quikit org.
//
// For each provisioned app (quikscale, quiksocial, quiktrack):
//   1. Creates the schema's "AppRole" table if it doesn't exist, mirroring
//      the canonical shape used by app_quikscale.AppRole (incl. PK, unique
//      index on (orgId, appId, name), FKs to quikit.Org and quikit.App).
//   2. Inserts "User" (default, non-system) + "Admin" (system) rows scoped
//      to (Quikit orgId, the app's appId). Uses ON CONFLICT DO NOTHING on
//      the (orgId, appId, name) unique index so re-running is safe.
//
// Run from repo root:
//   DATABASE_URL='...' DATABASE_URL_DIRECT='...' \
//     node scripts/seed-quikit-app-roles.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const QUIKIT_ORG_ID = "cmp2g1ww5001dkigkcakdx3v6";

// Slugs of apps the Quikit org has provisioned. (admin excluded — Admin
// Portal access is gated by membership role, not per-app role rows.)
const APP_SLUGS = ["quikscale", "quiksocial", "quiktrack"];

function section(title) {
  console.log("\n" + "═".repeat(80));
  console.log("  " + title);
  console.log("═".repeat(80));
}

async function ensureSchemaExists(schema) {
  await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);
}

async function ensureAppRoleTable(schema) {
  // Mirrors app_quikscale.AppRole exactly (see dump-app-quikscale-approle-ddl.mjs).
  // CREATE TABLE IF NOT EXISTS is idempotent — second run is a no-op.
  // We intentionally don't recreate FKs/indexes inside IF NOT EXISTS because
  // CREATE TABLE creates them atomically the first time; on a re-run the
  // table already has them.
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}"."AppRole" (
      "id"          TEXT NOT NULL,
      "orgId"       TEXT NOT NULL,
      "appId"       TEXT NOT NULL,
      "name"        TEXT NOT NULL,
      "description" TEXT,
      "isSystem"    BOOLEAN NOT NULL DEFAULT false,
      "isDefault"   BOOLEAN NOT NULL DEFAULT false,
      "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"   TIMESTAMP NOT NULL,
      "createdBy"   TEXT,
      CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
    );
  `);

  // The CREATE INDEX statements are also idempotent.
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx"
      ON "${schema}"."AppRole" USING btree ("orgId", "appId");
  `);
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key"
      ON "${schema}"."AppRole" USING btree ("orgId", "appId", name);
  `);

  // FKs — only add if not already present. pg_constraint lookup keeps this
  // idempotent. We don't gate on the table since CREATE TABLE IF NOT EXISTS
  // skips it on subsequent runs, but the FK ADD CONSTRAINT would error if
  // re-added.
  await db.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'AppRole_orgId_fkey'
           AND conrelid = '"${schema}"."AppRole"'::regclass
      ) THEN
        ALTER TABLE "${schema}"."AppRole"
          ADD CONSTRAINT "AppRole_orgId_fkey"
          FOREIGN KEY ("orgId") REFERENCES quikit."Org"(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'AppRole_appId_fkey'
           AND conrelid = '"${schema}"."AppRole"'::regclass
      ) THEN
        ALTER TABLE "${schema}"."AppRole"
          ADD CONSTRAINT "AppRole_appId_fkey"
          FOREIGN KEY ("appId") REFERENCES quikit."App"(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}

async function getAppId(slug) {
  const rows = await db.$queryRawUnsafe(
    `SELECT id FROM quikit."App" WHERE slug = $1 LIMIT 1;`,
    slug,
  );
  return rows[0]?.id ?? null;
}

async function insertRolesForOrg(schema, orgId, appId) {
  // Standard two-tier seed: User (default, non-system) and Admin (system).
  // ON CONFLICT on the (orgId, appId, name) unique index makes re-runs safe.
  const roles = [
    {
      id: randomUUID().replace(/-/g, "").slice(0, 25),
      name: "User",
      description: "Standard member access — view & contribute on assigned data",
      isSystem: false,
      isDefault: true,
    },
    {
      id: randomUUID().replace(/-/g, "").slice(0, 25),
      name: "Admin",
      description: "Full access within this app",
      isSystem: true,
      isDefault: false,
    },
  ];

  let inserted = 0;
  for (const r of roles) {
    const result = await db.$executeRawUnsafe(
      `
      INSERT INTO "${schema}"."AppRole"
        ("id", "orgId", "appId", "name", "description", "isSystem", "isDefault", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT ("orgId", "appId", "name") DO NOTHING;
      `,
      r.id,
      orgId,
      appId,
      r.name,
      r.description,
      r.isSystem,
      r.isDefault,
    );
    inserted += result;
  }
  return inserted;
}

async function summarise(schema, orgId) {
  const rows = await db.$queryRawUnsafe(
    `SELECT name, "isSystem", "isDefault"
       FROM "${schema}"."AppRole"
      WHERE "orgId" = $1
      ORDER BY "isSystem" DESC, "createdAt" ASC;`,
    orgId,
  );
  for (const r of rows) {
    console.log(`    • name="${r.name}"  isSystem=${r.isSystem}  isDefault=${r.isDefault}`);
  }
  return rows.length;
}

async function main() {
  // Confirm the org exists.
  const org = await db.$queryRawUnsafe(
    `SELECT id, name, slug FROM quikit."Org" WHERE id = $1 LIMIT 1;`,
    QUIKIT_ORG_ID,
  );
  if (org.length === 0) {
    console.error(`Org ${QUIKIT_ORG_ID} not found — aborting.`);
    process.exit(1);
  }
  console.log(`Target org: ${org[0].slug}  id=${org[0].id}`);

  for (const slug of APP_SLUGS) {
    section(`App: ${slug}`);
    const schema = `app_${slug}`;

    const appId = await getAppId(slug);
    if (!appId) {
      console.log(`  No quikit.App row with slug="${slug}" — skipping.`);
      continue;
    }
    console.log(`  appId: ${appId}`);

    console.log(`  Ensuring schema and AppRole table exist...`);
    await ensureSchemaExists(schema);
    await ensureAppRoleTable(schema);

    console.log(`  Inserting Quikit-org rows (User default + Admin system)...`);
    const inserted = await insertRolesForOrg(schema, QUIKIT_ORG_ID, appId);
    console.log(`  ${inserted} row(s) inserted (others already present, skipped via ON CONFLICT).`);

    console.log(`  Rows for Quikit org in ${schema}.AppRole:`);
    const total = await summarise(schema, QUIKIT_ORG_ID);
    console.log(`  total: ${total}`);
  }

  await db.$disconnect();
  console.log("\nSeed complete.");
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
