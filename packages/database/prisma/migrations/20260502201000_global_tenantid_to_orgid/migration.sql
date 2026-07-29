-- Global normalization: rename tenantId -> orgId across all app schemas.
-- This makes DB naming consistent with v4 org-centric model.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'tenantId'
      AND table_schema IN ('public', 'quikit', 'app_quikscale', 'app_quikconstruction', 'app_quikvc')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
      r.table_schema, r.table_name, 'tenantId', 'orgId'
    );
  END LOOP;
END $$;
