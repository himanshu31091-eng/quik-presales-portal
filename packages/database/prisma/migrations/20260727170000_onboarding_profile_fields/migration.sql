-- Post-registration onboarding — "A few quick details" step.
--
-- Adds optional profile columns captured after Set-Password during self-serve
-- workspace registration. The step is fully skippable, so every column is
-- nullable and existing rows simply stay NULL.
--
--   auth."User".jobRole             — the person's self-described role
--   quikit."Org".industry           — business industry
--   quikit."Org".companySize        — employee-count band
--   quikit."Org".primaryUseCase     — what the workspace is mainly for
--
-- Idempotent (IF NOT EXISTS) — safe to hand-apply; the build pipeline does not
-- run `migrate deploy`. Mirrors the 20260723140000_quikcrm_prospect_convert
-- convention.

ALTER TABLE auth."User"
  ADD COLUMN IF NOT EXISTS "jobRole" text;

ALTER TABLE quikit."Org"
  ADD COLUMN IF NOT EXISTS "industry" text,
  ADD COLUMN IF NOT EXISTS "companySize" text,
  ADD COLUMN IF NOT EXISTS "primaryUseCase" text;
