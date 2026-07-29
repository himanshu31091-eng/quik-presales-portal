-- QuikScale: per-user column drag-and-drop order for data grids.
-- JSON-stringified string[] of column keys in the user's chosen order; NULL =
-- default order (no customization). Additive + nullable, mirrors the existing
-- hiddenCols / colWidths JSON columns. Idempotent so re-running is safe.
ALTER TABLE "app_quikscale"."UserTablePreference" ADD COLUMN IF NOT EXISTS "colOrder" TEXT;
