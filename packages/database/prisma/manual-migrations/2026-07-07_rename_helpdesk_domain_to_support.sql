-- Rename the QuikSupport public domain back: helpdesk.quikit.ai -> support.quikit.ai
-- (and uathelpdesk.quikit.ai -> uatsupport.quikit.ai).
--
-- Reverses 2026-07-03_rename_support_domain_to_helpdesk.sql. The public domain
-- is standardising on support.quikit.ai / uatsupport.quikit.ai to match the
-- app name (QuikSupport) and the auth allow-lists.
--
-- These URLs are stored in the central app registry in the `quikit` schema:
--   * "App".baseUrl              — the app's launch/base URL
--   * "OAuthClient".redirectUris — the OAuth callback allow-list (String[])
--
-- Uses REPLACE so a row holding either the prod or the UAT value is fixed in
-- place regardless of which environment this runs against. Idempotent: a value
-- already pointing at *support* is left untouched.

BEGIN;

-- 1. App.baseUrl
UPDATE "quikit"."App"
SET "baseUrl" = replace(
      replace("baseUrl", 'https://uathelpdesk.quikit.ai', 'https://uatsupport.quikit.ai'),
      'https://helpdesk.quikit.ai', 'https://support.quikit.ai'
    ),
    "updatedAt" = now()
WHERE "baseUrl" LIKE 'https://helpdesk.quikit.ai%'
   OR "baseUrl" LIKE 'https://uathelpdesk.quikit.ai%';

-- 2. OAuthClient.redirectUris (text array — rewrite each element)
UPDATE "quikit"."OAuthClient"
SET "redirectUris" = ARRAY(
      SELECT replace(
               replace(uri, 'https://uathelpdesk.quikit.ai', 'https://uatsupport.quikit.ai'),
               'https://helpdesk.quikit.ai', 'https://support.quikit.ai'
             )
      FROM unnest("redirectUris") AS uri
    ),
    "updatedAt" = now()
WHERE EXISTS (
      SELECT 1 FROM unnest("redirectUris") AS uri
      WHERE uri LIKE 'https://helpdesk.quikit.ai%'
         OR uri LIKE 'https://uathelpdesk.quikit.ai%'
    );

COMMIT;
