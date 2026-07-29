-- Drops the orphaned Banks table (CnBank).
-- The CnBank model no longer exists in schema.prisma and no application code
-- (UI/API/hooks/repository) uses it. The table is a leftover from an old
-- migration. CASCADE clears any residual FK constraints on drop.

-- DropForeignKey (Prisma default names; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Banks" DROP CONSTRAINT IF EXISTS "Banks_companyId_fkey";
ALTER TABLE "app_quikinfra"."Banks" DROP CONSTRAINT IF EXISTS "Banks_orgId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Banks" CASCADE;