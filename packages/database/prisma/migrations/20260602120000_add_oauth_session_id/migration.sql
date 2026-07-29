-- Add Redis-backed session id propagation columns to the OIDC code/refresh
-- tables so the central session id rides the id_token into consumer apps.
-- Nullable + no default: existing rows stay valid, new flows populate it.
ALTER TABLE "quikit"."OAuthCode" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "quikit"."OAuthRefreshToken" ADD COLUMN "sessionId" TEXT;
