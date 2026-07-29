-- Rename the QuikSupport public domain: support.quikit.ai -> helpdesk.quikit.ai
-- (and uatsupport.quikit.ai -> uathelpdesk.quikit.ai).
--
-- These URLs are stored in the central app registry in the `quikit` schema:
--   * "App".baseUrl              — the app's launch/base URL
--   * "OAuthClient".redirectUris — the OAuth callback allow-list (String[])
--
-- Uses REPLACE so a row holding either the prod or the UAT value is fixed in
-- place regardless of which environment this runs against. Idempotent: a value
-- already pointing at *helpdesk* is left untouched.

BEGIN;

-- 1. App.baseUrl
UPDATE "quikit"."App"
SET "baseUrl" = replace(
      replace("baseUrl", 'https://uatsupport.quikit.ai', 'https://uathelpdesk.quikit.ai'),
      'https://support.quikit.ai', 'https://helpdesk.quikit.ai'
    ),
    "updatedAt" = now()
WHERE "baseUrl" LIKE 'https://support.quikit.ai%'
   OR "baseUrl" LIKE 'https://uatsupport.quikit.ai%';

-- 2. OAuthClient.redirectUris (text array — rewrite each element)
UPDATE "quikit"."OAuthClient"
SET "redirectUris" = ARRAY(
      SELECT replace(
               replace(uri, 'https://uatsupport.quikit.ai', 'https://uathelpdesk.quikit.ai'),
               'https://support.quikit.ai', 'https://helpdesk.quikit.ai'
             )
      FROM unnest("redirectUris") AS uri
    ),
    "updatedAt" = now()
WHERE EXISTS (
      SELECT 1 FROM unnest("redirectUris") AS uri
      WHERE uri LIKE 'https://support.quikit.ai%'
         OR uri LIKE 'https://uatsupport.quikit.ai%'
    );

COMMIT;
