-- QuikLMS: make app_quiklms.users.email unique per tenant.
--
-- WHY: `email` was the only identity-shaped column on this table with no
-- uniqueness constraint. Its siblings all have one —
-- users_orgId_studentId_key, users_orgId_employeeId_key,
-- users_orgId_parentCode_key — so the omission reads as an oversight rather
-- than a decision. Two LMS rows could hold the same address inside one org,
-- which breaks the assumption every "look the user up by email" path makes
-- (see `registerUser`'s duplicate check, which is a findFirst and therefore
-- races). The central contract is `email @unique` on `auth.User`; this is its
-- per-tenant analogue.
--
-- SCOPED TO THE ORG, not global, for two reasons: it matches the sibling
-- constraints above, and it stays forward-compatible with the multi-org bridge
-- (the `authUserId` work) where one person legitimately holds a row per org.
-- Postgres treats NULLs as distinct, so rows with a NULL `orgId` — the global
-- operator accounts — remain exempt, which is the behaviour the other three
-- sparse uniques already rely on.
--
-- The pre-existing non-unique index on the same pair is dropped: a unique index
-- serves every lookup the plain one did, so keeping both just costs writes.
--
-- SAFETY: verified before writing — 0 duplicate (orgId, lower(email)) groups in
-- the database, so the index builds without conflict. If a future environment
-- DOES hold duplicates this migration will fail loudly rather than silently
-- discard a row; resolve them first with:
--   SELECT "orgId", lower(email), count(*) FROM app_quiklms.users
--    GROUP BY 1,2 HAVING count(*) > 1;

-- DropIndex
DROP INDEX "app_quiklms"."users_orgId_email_idx";

-- CreateIndex
CREATE UNIQUE INDEX "users_orgId_email_key" ON "app_quiklms"."users"("orgId", "email");
