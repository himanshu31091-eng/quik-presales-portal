import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'prod-sync-quiktrack-2026-06-17.sql');
const sql = readFileSync(sqlPath, 'utf8');

const connectionString =
  'postgresql://neondb_owner:npg_T0B9wIxuXfFQ@ep-flat-wave-aoqmtjgl-pooler.c-2.ap-southeast-1.aws.neon.tech/quikit_dev?sslmode=require&channel_binding=require';

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

const run = async () => {
  await client.connect();
  console.log('Connected. Executing prod-sync SQL...');
  await client.query(sql);
  console.log('SQL executed successfully (committed).');

  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'app_quiktrack'
       AND table_name IN ('QtDocFolder','QtCustomField','QtCustomFieldOption',
                          'QtIssueFieldValue','QtCustomFieldAudit','QtReportView','QtFeedback')
     ORDER BY table_name;`
  );
  console.log('Verified tables present in app_quiktrack:');
  for (const r of rows) console.log('  -', r.table_name);
};

run()
  .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; })
  .finally(() => client.end());
