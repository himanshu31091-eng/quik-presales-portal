-- QuikLMS: add the authUserId bridge column (Phase 1 of the identity bridge).
--
-- WHY: `app_quiklms.users.id` doubles as the central `auth.User.id` for every
-- centrally-provisioned person — a convention documented in comments and
-- enforced by nothing. HRMS solved the same problem properly, with a separate
-- primary key plus a nullable `authUserId` and `@@unique([orgId, authUserId])`
-- (baseline §9). This adds the missing half to QuikLMS.
--
-- WHAT THIS CHANGES BEHAVIOURALLY: nothing. `id` still carries the central id,
-- and this column mirrors it, so every existing lookup keeps working. What it
-- buys is that the link is now EXPLICIT and constrained instead of implied by a
-- naming convention.
--
-- WHAT IT DOES NOT DO — deliberately. It does not make `id` independent of the
-- central id, so multi-org membership is still not representable. That flip is a
-- separate, much larger piece of work: ~49 identity lookups and 19 places that
-- write a session id straight into an LMS foreign key, across ~35 tables whose
-- user references are BARE SCALARS with no database foreign key. A partial
-- migration there does not throw — it silently orphans learner progress,
-- certificates, attendance and payouts. So the flip waits until every call site
-- routes through one resolver and real FKs exist to catch mistakes.
--
-- THE BACKFILL IS CONDITIONAL, and that matters. `authUserId` is set to `id`
-- only where a matching `auth.User` actually exists. At time of writing, 5 of
-- 32 LMS rows have NO central user — legacy/demo accounts (admin@quikskill.com,
-- learner@demo.com, manager@demo.com and two tenant admins) whose uuid ids were
-- never provisioned centrally. Blanket-setting `authUserId = id` would assert
-- five identity links that do not exist. They are left NULL, which is the
-- correct state: "this person has no central identity" — exactly what HRMS uses
-- NULL `authUserId` for.
--
-- SAFETY: purely additive. One nullable column, one backfill that only ever
-- writes a value already present in `id`, and one sparse unique index. No
-- existing column, constraint or row is modified or removed. The unique cannot
-- conflict: `authUserId` is copied from the primary key, so duplicates are
-- impossible by construction (verified: 0 candidate duplicate groups).

-- AlterTable
ALTER TABLE "app_quiklms"."users" ADD COLUMN "authUserId" TEXT;

-- Backfill: link only the rows that genuinely have a central identity.
UPDATE "app_quiklms"."users" u
   SET "authUserId" = u.id
 WHERE EXISTS (SELECT 1 FROM "auth"."User" au WHERE au.id = u.id);

-- CreateIndex
CREATE UNIQUE INDEX "users_orgId_authUserId_key" ON "app_quiklms"."users"("orgId", "authUserId");
