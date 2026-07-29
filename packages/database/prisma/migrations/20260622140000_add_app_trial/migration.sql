-- Per-app free-trial expiry for self-serve app activation. Additive + idempotent.
-- Existing OrgAppAccess rows get NULL → treated as active (grandfathered), so
-- every currently-provisioned app stays launchable exactly as before.
ALTER TABLE "quikit"."OrgAppAccess" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
