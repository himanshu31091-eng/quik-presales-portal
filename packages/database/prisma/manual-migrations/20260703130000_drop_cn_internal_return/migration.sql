-- Drops the abandoned Internal Return subsystem (CnInternalReturn + CnInternalReturnLine).
-- No runtime code queries these tables; the store "Internal Return" page/API were removed.
-- The child table (lines) is dropped before the parent (returns) to satisfy FK ordering.

-- DropForeignKey
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_returnId_fkey";
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Internal_return_lines" DROP CONSTRAINT IF EXISTS "Internal_return_lines_uomId_fkey";

-- DropForeignKey
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_projectId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_issueId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_locationId_fkey";
ALTER TABLE "app_quikinfra"."Internal_returns" DROP CONSTRAINT IF EXISTS "Internal_returns_orgId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Internal_return_lines";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Internal_returns";