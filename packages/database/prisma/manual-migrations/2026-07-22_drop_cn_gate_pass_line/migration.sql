-- Drops the abandoned Gate Pass line table (CnGatePassLine -> "Gate_pass_lines").
-- Gate pass lines are stored as a JSONB `materials` column on the header table
-- ("Gate_passes" / CnGatePass) — see lib/store/gate-pass-repository.ts, which
-- inserts `${materialsJson}::jsonb` and reads `row.materials`. The relational
-- line table is never read or written by application code (nor by any seed).
-- The CnGatePassLine model has been removed from schema.prisma.
--
-- No other table has a foreign key INTO "Gate_pass_lines": the only constraint
-- lives ON this table (gatePassId -> Gate_passes). itemId/uomId are plain
-- string columns, not FKs. CASCADE clears the remaining constraint on drop.

-- DropForeignKey (Prisma default name; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Gate_pass_lines" DROP CONSTRAINT IF EXISTS "Gate_pass_lines_gatePassId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Gate_pass_lines" CASCADE;
