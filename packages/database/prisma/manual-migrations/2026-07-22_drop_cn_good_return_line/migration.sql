-- Drops the abandoned Good Return line table (CnGoodReturnLine -> "Good_return_lines").
-- Good return lines are stored as a JSONB `materials` column on the header table
-- ("Good_returns" / CnGoodReturn) — see lib/store/good-return-repository.ts, which
-- inserts `${materialsJson}::jsonb` and reads `row.materials`. The relational line
-- table is never read or written by application code (nor by any seed). The
-- CnGoodReturnLine model has been removed from schema.prisma.
--
-- No other table has a foreign key INTO "Good_return_lines": the only constraint
-- lives ON this table (returnId -> Good_returns). itemId/uomId are plain string
-- columns, not FKs. CASCADE clears the remaining constraint on drop.

-- DropForeignKey (Prisma default name; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Good_return_lines" DROP CONSTRAINT IF EXISTS "Good_return_lines_returnId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Good_return_lines" CASCADE;
