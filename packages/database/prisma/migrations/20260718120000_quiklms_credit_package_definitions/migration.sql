-- QuikLMS: promote credit package DEFINITIONS out of the Tenant.creditConfig
-- JSON blob into a real table.
--
-- WHY: every edit to a package was a read-modify-write of the whole
-- `creditConfig` object, so two admins editing packages concurrently silently
-- lost one of the edits — and the blob rewrite could also clobber a concurrent
-- change to any OTHER creditConfig key (expiryMonths, lowCreditThreshold,
-- zeroCreditPolicy). Each definition is now an independently-updatable row.
--
-- SAFETY: purely additive. Creates one new table; touches no existing table,
-- column or row. `creditConfig` is left exactly as it is, and the application
-- still reads package definitions from it as a fallback for any tenant whose
-- catalogue has not been backfilled yet (see `getPackageDefinitions`). So this
-- migration is safe to apply before the code deploys, and safe to apply to a
-- database whose tenants still hold their packages in the blob.

CREATE TABLE "app_quiklms"."credit_package_definitions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "validityMonths" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_package_definitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_package_definitions_orgId_isActive_idx"
    ON "app_quiklms"."credit_package_definitions"("orgId", "isActive");
