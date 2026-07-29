-- QuikSocial: add Instagram Business Account ID to SocialAccount.
-- IG publishing (Graph API POST /{id}/media) requires the IG Business
-- Account ID, NOT the Facebook Page ID. Nullable; populated on the IG
-- connect happy path and self-healed for legacy rows by lib/meta/dispatch.ts.
-- Mirrors the committed Prisma field SocialAccount.igBusinessAccountId (String?).
-- Single-column additive migration — nothing else.

ALTER TABLE "app_quiksocial"."SocialAccount" ADD COLUMN "igBusinessAccountId" TEXT;
