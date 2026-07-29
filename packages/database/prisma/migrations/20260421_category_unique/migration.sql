-- CategoryMaster: make (tenantId, case-insensitive name, dataType, currency) unique
-- Two categories may share the same case-insensitive name only if their
-- (dataType, currency) tuple differs (e.g. "Revenue" as Number + "Revenue" as Currency/USD).

-- 1. Add the nameKey column (nullable first so we can backfill).
ALTER TABLE "CategoryMaster" ADD COLUMN "nameKey" TEXT;

-- 2. Backfill existing rows with lowercased+trimmed name.
UPDATE "CategoryMaster"
SET "nameKey" = LOWER(TRIM("name"));

-- 3. Dedupe existing duplicates — keep the earliest-created row per tuple,
--    delete later ones. This is safe since CategoryMaster has no cascading FKs
--    (categories are referenced loosely by OPSPItem etc., but deleting unused
--    duplicates only removes the duplicate row, not the original).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", "nameKey", "dataType", COALESCE("currency", '')
           ORDER BY "createdAt" ASC
         ) AS rn
  FROM "CategoryMaster"
)
DELETE FROM "CategoryMaster"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Enforce NOT NULL now that every row has a value.
ALTER TABLE "CategoryMaster" ALTER COLUMN "nameKey" SET NOT NULL;

-- 5. Add the unique index. Postgres treats NULL currency values as distinct,
--    which is fine — but we want all Number/Percentage rows (currency IS NULL)
--    to still collide on the same (tenantId, nameKey, dataType). NULLs NOT
--    DISTINCT gives us that.
CREATE UNIQUE INDEX "category_tenant_name_type_currency_uniq"
ON "CategoryMaster" ("tenantId", "nameKey", "dataType", "currency")
NULLS NOT DISTINCT;
