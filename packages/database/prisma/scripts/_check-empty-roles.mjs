import pg from 'pg';

const connectionString =
  'postgresql://neondb_owner:npg_T0B9wIxuXfFQ@ep-flat-wave-aoqmtjgl-pooler.c-2.ap-southeast-1.aws.neon.tech/quikit_dev?sslmode=require&channel_binding=require';

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

const run = async () => {
  await client.connect();

  // Roles with zero grants (the migration's empty creations), incl. member counts.
  const empty = await client.query(`
    SELECT r."projectId", r.name,
           COUNT(p.id) AS grants,
           (SELECT COUNT(*) FROM app_quiktrack."QtProjectUserRole" ur
              WHERE ur."projectRoleId" = r.id) AS members
    FROM app_quiktrack."QtProjectRole" r
    LEFT JOIN app_quiktrack."QtProjectRolePermission" p ON p."projectRoleId" = r.id
    WHERE r.name IN ('Space Admin','Contributor','Viewer')
    GROUP BY r.id, r."projectId", r.name
    HAVING COUNT(p.id) = 0
    ORDER BY r."projectId", r.name;
  `);

  console.log('--- Roles with ZERO grants (Space Admin/Contributor/Viewer) ---');
  if (empty.rows.length === 0) {
    console.log('  none');
  } else {
    for (const r of empty.rows) {
      console.log(`  project=${r.projectId}  role=${r.name}  grants=${r.grants}  members=${r.members}`);
    }
  }

  // Full role inventory per project (sanity check of the merge result).
  const inv = await client.query(`
    SELECT r."projectId", r.name, r."isDefault",
           (SELECT COUNT(*) FROM app_quiktrack."QtProjectRolePermission" p WHERE p."projectRoleId" = r.id) AS grants,
           (SELECT COUNT(*) FROM app_quiktrack."QtProjectUserRole" ur WHERE ur."projectRoleId" = r.id) AS members
    FROM app_quiktrack."QtProjectRole" r
    ORDER BY r."projectId", r.name;
  `);
  console.log('\n--- Full project-role inventory ---');
  for (const r of inv.rows) {
    console.log(`  project=${r.projectId}  role=${r.name.padEnd(12)}  default=${r.isDefault}  grants=${r.grants}  members=${r.members}`);
  }
};

run()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => client.end());
