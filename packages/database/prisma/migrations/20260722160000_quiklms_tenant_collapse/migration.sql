-- QuikLMS: collapse LmsTenant onto the platform Org.
--
-- ⚠️ DESTRUCTIVE. Drops five columns, one enum type, and one row.
--
-- WHY: `app_quiklms.tenants` had grown into a SECOND tenant registry sitting
-- beside `quikit.Org` rather than a per-tenant LMS profile hanging off it
-- (baseline §3). Five pieces of that duplication are removed here.
--
--   status              A second org status (Active | Paused | Trial),
--                       independent of Org.status and consulted by NO gate.
--                       §3 makes an active membership require
--                       `Org.status = 'active'`, so "pausing" a tenant in the
--                       LMS suspended nothing: its users kept working
--                       everywhere, QuikLMS included. The super-admin
--                       pause/reactivate toggle now writes `Org.status`, so it
--                       actually takes effect, and the API still reports
--                       Active/Paused via apps/quiklms/lib/tenant-status.ts.
--                       `Trial` is not carried over — a trial is
--                       `Subscription.status` + `OrgAppAccess.trialEndsAt`, not
--                       a third org state — and no row ever used it.
--
--   dbConnectionString  A per-tenant database connection string, left over from
--                       the pre-fold design where each tenant had its own DB.
--                       Every tenant now lives in the one shared multiSchema
--                       database, and this stored a credential in a plain
--                       column. No row ever held a value.
--
--   auth0OrganizationId Residue of a third identity system. QuikIT SSO replaced
--   auth0UserId         Auth0; nothing in the app has read these since.
--
--   loginUrl            Always `${BASE_URL}/login` — the same string
--                       denormalised onto every row, which went stale whenever
--                       the deployment URL changed. Derived at the edge now.
--
-- AND the `orgId` invariant is finally enforced. The column was nullable while
-- the orgId fold was in flight, so "Tenant.id === orgId" was documented but
-- unenforceable. It is now NOT NULL.
--
-- DATA AT TIME OF WRITING (local dev database, 17 tenant rows):
--   status              17 Active, 0 Paused, 0 Trial — and 16 of 17 already
--                       agreed with their Org.status, so no state is lost.
--   dbConnectionString  0 non-null
--   auth0OrganizationId 1 non-null
--   auth0UserId         1 non-null
--   loginUrl            15 non-null (all the same derived string)
--   orgId               1 NULL
--
-- THE ROW THIS DELETES. Exactly one tenant blocks the NOT NULL constraint:
--   id        8e82f811-02d7-442e-9b4f-89a174239e2f
--   name      "Sandipani Higher Secondary School"
--   subdomain sandipani-higher-secondary-school
--   created   2026-07-06 — the day of the orgId fold migration
-- It has a NULL orgId, NO matching `quikit.Org`, and ZERO LMS users attached.
-- It is an onboarding that never completed and was never back-filled by
-- prisma/_retired-migrations/20260706000000_add_tenant_orgid. Every other row
-- already satisfies orgId = id.
--
-- ⚠️ BEFORE APPLYING TO UAT / PRODUCTION: those environments may hold a
-- DIFFERENT set of unlinked tenants, and this migration will delete every one of
-- them. Check first, and export anything you want to keep:
--   SELECT t.id, t.name, t.subdomain, t."orgId"
--     FROM app_quiklms.tenants t
--     LEFT JOIN quikit."Org" o ON o.id = t.id
--    WHERE t."orgId" IS NULL OR o.id IS NULL;
-- A row with real users attached must be linked to an Org rather than deleted.
-- The DELETE below is deliberately scoped to childless rows so it cannot
-- silently destroy a populated tenant — if a populated unlinked tenant exists,
-- the ALTER ... SET NOT NULL will fail loudly instead.

-- Remove unlinked, EMPTY tenants only. A tenant with users survives and will
-- make the SET NOT NULL below fail, which is the intended safety valve.
DELETE FROM "app_quiklms"."tenants" t
WHERE (t."orgId" IS NULL OR NOT EXISTS (SELECT 1 FROM "quikit"."Org" o WHERE o.id = t.id))
  AND NOT EXISTS (SELECT 1 FROM "app_quiklms"."users" u WHERE u."orgId" = t.id);

-- Belt and braces: every surviving row must satisfy the invariant before the
-- constraint lands. This is a no-op on data that is already correct.
UPDATE "app_quiklms"."tenants" SET "orgId" = id WHERE "orgId" IS DISTINCT FROM id;

-- DropIndex (it referenced the status column)
DROP INDEX "app_quiklms"."tenants_tenantType_status_idx";

-- AlterTable
ALTER TABLE "app_quiklms"."tenants"
  DROP COLUMN "dbConnectionString",
  DROP COLUMN "status",
  DROP COLUMN "auth0OrganizationId",
  DROP COLUMN "auth0UserId",
  DROP COLUMN "loginUrl",
  ALTER COLUMN "orgId" SET NOT NULL;

-- DropEnum
DROP TYPE "app_quiklms"."TenantStatus";

-- CreateIndex
CREATE INDEX "tenants_tenantType_idx" ON "app_quiklms"."tenants"("tenantType");
