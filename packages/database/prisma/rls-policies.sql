-- ============================================================================
-- Row-Level Security (RLS) Policies for QuikScale
-- Phase 8 of the A-Grade roadmap
--
-- These policies provide a database-level enforcement layer ON TOP OF the
-- application-level `WHERE tenantId = ?` filters. Belt-and-braces: even if
-- the app has a bug that forgets the tenantId filter, Postgres itself will
-- block cross-tenant data access.
--
-- HOW IT WORKS:
--   1. Before each request, the app sets: SET LOCAL app.tenant_id = '<id>'
--   2. RLS policies check: row.tenantId = current_setting('app.tenant_id')
--   3. Any query that doesn't match is silently filtered out (SELECT) or
--      rejected (INSERT/UPDATE/DELETE)
--
-- TO APPLY:
--   psql $DATABASE_URL -f packages/database/prisma/rls-policies.sql
--
-- TO DISABLE (emergency):
--   ALTER TABLE "KPI" DISABLE ROW LEVEL SECURITY;
--   (repeat for each table)
--
-- IMPORTANT: The Prisma migration user (used by `prisma migrate deploy`)
-- must be a SUPERUSER or the table OWNER to bypass RLS during migrations.
-- Application connections should use a non-superuser role.
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
-- (only the major ones — add more as needed)

ALTER TABLE "KPI" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KPIWeeklyValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KPILog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KPINote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserTeam" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Priority" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriorityWeeklyStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WWWItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingAttendee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyHuddle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OPSPData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PerformanceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TalentAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OneOnOne" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuarterSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

-- Create policies: SELECT/INSERT/UPDATE/DELETE all check tenantId
-- Using a function to avoid repeating the expression 25 times

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
  SELECT coalesce(current_setting('app.tenant_id', true), '');
$$ LANGUAGE SQL STABLE;

-- Macro: create standard CRUD policies for a table with a tenantId column
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'KPI', 'KPIWeeklyValue', 'KPILog', 'KPINote',
    'Team', 'UserTeam',
    'Priority', 'PriorityWeeklyStatus',
    'WWWItem',
    'Meeting', 'MeetingTemplate', 'MeetingAttendee',
    'DailyHuddle',
    'OPSPData',
    'PerformanceReview', 'TalentAssessment',
    'Goal', 'OneOnOne', 'FeedbackEntry',
    'AuditLog', 'FeatureFlag', 'QuarterSetting',
    'Membership', 'Notification'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop existing policies if re-running
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_insert ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_update ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_delete ON %I', tbl);

    -- SELECT: can only see rows belonging to your tenant
    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING ("tenantId" = current_tenant_id())',
      tbl
    );

    -- INSERT: can only insert rows for your tenant
    EXECUTE format(
      'CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK ("tenantId" = current_tenant_id())',
      tbl
    );

    -- UPDATE: can only update rows belonging to your tenant
    EXECUTE format(
      'CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING ("tenantId" = current_tenant_id())',
      tbl
    );

    -- DELETE: can only delete rows belonging to your tenant
    EXECUTE format(
      'CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING ("tenantId" = current_tenant_id())',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION: After applying, test with:
--
--   SET LOCAL app.tenant_id = 'tenant-1';
--   SELECT count(*) FROM "KPI";  -- should return only tenant-1's KPIs
--
--   SET LOCAL app.tenant_id = 'tenant-2';
--   SELECT count(*) FROM "KPI";  -- should return only tenant-2's KPIs
--
--   RESET app.tenant_id;
--   SELECT count(*) FROM "KPI";  -- should return 0 (no tenant set = no access)
-- ============================================================================
