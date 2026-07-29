// Scans every "app_*" schema for an "AppRole" table, prints columns + row
// counts, and dumps any rows scoped to the Quikit org.
//
// Run from repo root:
//   DATABASE_URL='...' DATABASE_URL_DIRECT='...' node scripts/inspect-app-roles.mjs

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const QUIKIT_ORG_ID = "cmp2g1ww5001dkigkcakdx3v6";

function section(title) {
  console.log("\n" + "═".repeat(80));
  console.log("  " + title);
  console.log("═".repeat(80));
}

async function main() {
  section("All schemas matching app_*");
  const schemas = await db.$queryRawUnsafe(
    `SELECT schema_name
       FROM information_schema.schemata
      WHERE schema_name LIKE 'app\\_%' ESCAPE '\\'
      ORDER BY schema_name;`,
  );
  console.log(schemas);

  for (const s of schemas) {
    const schema = s.schema_name;
    section(`Schema: ${schema}`);

    const tables = await db.$queryRawUnsafe(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_name ILIKE 'AppRole'
        ORDER BY table_name;`,
      schema,
    );
    if (tables.length === 0) {
      console.log("  no AppRole table");
      continue;
    }

    const cols = await db.$queryRawUnsafe(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'AppRole'
        ORDER BY ordinal_position;`,
      schema,
    );
    console.log(`  AppRole columns:`);
    for (const c of cols) {
      console.log(`    - ${c.column_name.padEnd(20)} ${c.data_type}  nullable=${c.is_nullable}`);
    }

    const total = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM "${schema}"."AppRole";`,
    );
    console.log(`  total rows: ${total[0].n}`);

    const forQuikit = await db.$queryRawUnsafe(
      `SELECT id, "orgId", "appId", name, description, "isSystem", "isDefault"
         FROM "${schema}"."AppRole"
        WHERE "orgId" = $1
        ORDER BY "isSystem" DESC, "createdAt" ASC;`,
      QUIKIT_ORG_ID,
    );
    console.log(`  rows for Quikit orgId=${QUIKIT_ORG_ID}: ${forQuikit.length}`);
    for (const r of forQuikit) {
      console.log(`    • name="${r.name}" isSystem=${r.isSystem} isDefault=${r.isDefault} description="${(r.description ?? "").slice(0, 60)}"`);
    }

    const someRows = await db.$queryRawUnsafe(
      `SELECT id, "orgId", "appId", name, "isSystem", "isDefault"
         FROM "${schema}"."AppRole"
        ORDER BY "createdAt" ASC
        LIMIT 5;`,
    );
    console.log(`  sample of any 5 rows (for comparison):`);
    for (const r of someRows) {
      console.log(`    • org=${r.orgId.slice(0, 12)}…  name="${r.name}"  isSystem=${r.isSystem}  isDefault=${r.isDefault}`);
    }
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
