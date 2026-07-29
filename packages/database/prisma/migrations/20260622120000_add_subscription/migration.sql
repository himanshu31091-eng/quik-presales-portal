-- Self-serve registration + 14-day trial: per-org subscription state.
-- Additive and idempotent. An org with NO Subscription row is grandfathered
-- (treated as active) by every read path, and the backfill below explicitly
-- marks every PRE-EXISTING org as permanently-active so none are ever gated.

-- CreateTable
CREATE TABLE IF NOT EXISTS "quikit"."Subscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "planSlug" TEXT NOT NULL DEFAULT 'startup',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_orgId_key" ON "quikit"."Subscription"("orgId");
CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "quikit"."Subscription"("status");
CREATE INDEX IF NOT EXISTS "Subscription_trialEndsAt_idx" ON "quikit"."Subscription"("trialEndsAt");

-- AddForeignKey (guarded so re-runs don't error)
DO $$ BEGIN
    ALTER TABLE "quikit"."Subscription"
        ADD CONSTRAINT "Subscription_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: grandfather every EXISTING org as permanently-active, NO trial.
-- Idempotent via WHERE NOT EXISTS, so re-running never duplicates rows and
-- never touches subscriptions created later by self-serve registration.
INSERT INTO "quikit"."Subscription"
    ("id", "orgId", "status", "planSlug", "trialEndsAt", "currentPeriodEnd", "source", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    o."id",
    'active',
    COALESCE(o."plan", 'startup'),
    NULL,
    NULL,
    'backfill',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "quikit"."Org" o
WHERE NOT EXISTS (
    SELECT 1 FROM "quikit"."Subscription" s WHERE s."orgId" = o."id"
);
