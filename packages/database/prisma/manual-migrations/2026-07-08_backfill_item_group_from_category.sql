-- ============================================================================
-- Manual DB migration — backfill CnItem.groupId from the category label
-- Schema: app_quikinfra   Table: Items   Model: CnItem
--
-- Reason: Historically `createItem` always linked every item to the default
-- "Others" item group and stored the user-picked category only as free text in
-- Items.category. Because the grouped material picker buckets items by groupId,
-- every real group showed "0 materials" while all items sat under "Others".
-- The app code now resolves groupId from the category on create/update; this
-- migration repairs the rows written before that fix.
--
-- Behavior (deliberately conservative for production):
--   * Re-point an item's groupId to the group whose name matches its category
--     text (case/space-insensitive) ONLY when such a group already exists.
--   * Items whose category matches no existing group are LEFT UNTOUCHED — they
--     stay in "Others". No groups are created here, so typo/junk categories can
--     never spawn stray groups in the master.
--   * Items with a null/blank category are also left untouched (stay "Others").
--   * When duplicate groups share a name, the oldest is chosen so the result
--     is deterministic.
--
-- Run on BOTH local and the central (production) databases. Idempotent —
-- already-correct rows are skipped, so a second run updates 0 rows.
--
-- Preview before running (optional):
--   -- rows that WILL be fixed
--   SELECT count(*) FROM app_quikinfra."Items" i
--   JOIN app_quikinfra."Item_groups" g
--     ON g."orgId" = i."orgId"
--    AND lower(trim(g.name)) = lower(trim(i.category))
--    AND g.status NOT IN ('inactive','deleted')
--   WHERE i.category IS NOT NULL AND trim(i.category) <> '' AND i."groupId" <> g.id;
-- ============================================================================

UPDATE "app_quikinfra"."Items" i
SET "groupId" = m.gid,
    "updatedAt" = NOW()
FROM (
    SELECT DISTINCT ON (i2.id) i2.id AS item_id, g.id AS gid
    FROM "app_quikinfra"."Items" i2
    JOIN "app_quikinfra"."Item_groups" g
      ON g."orgId" = i2."orgId"
     AND lower(trim(g.name)) = lower(trim(i2.category))
     AND g.status NOT IN ('inactive', 'deleted')
    WHERE i2.category IS NOT NULL
      AND trim(i2.category) <> ''
    ORDER BY i2.id, g."createdAt" ASC, g.id ASC
) m
WHERE i.id = m.item_id
  AND i."groupId" <> m.gid;