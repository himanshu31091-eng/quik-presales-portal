-- Drops the abandoned Stock Transfer line table (CnStockTransferLine -> "Stock_transfer_lines").
-- Stock transfer lines are stored as a JSONB `materials` column on the header
-- table ("Stock_transfers" / CnStockTransfer) — see lib/store/stock-transfer-repository.ts,
-- which writes `${JSON.stringify(lines)}::jsonb` and reads `row.materials`. The
-- relational line table is never read or written by application code (nor by any
-- seed). The CnStockTransferLine model has been removed from schema.prisma.
--
-- No other table has a foreign key INTO "Stock_transfer_lines": the only
-- constraints live ON this table (transferId -> Stock_transfers, itemId -> Items,
-- uomId -> Uoms). CASCADE clears them on drop.

-- DropForeignKey (Prisma default names; IF EXISTS so a name mismatch is a no-op)
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_transferId_fkey";
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_itemId_fkey";
ALTER TABLE "app_quikinfra"."Stock_transfer_lines" DROP CONSTRAINT IF EXISTS "Stock_transfer_lines_uomId_fkey";

-- DropTable
DROP TABLE IF EXISTS "app_quikinfra"."Stock_transfer_lines" CASCADE;
