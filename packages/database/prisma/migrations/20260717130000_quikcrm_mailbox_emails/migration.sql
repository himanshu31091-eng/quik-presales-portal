-- QuikCRM: Mailbox module (P3) — raw mirror of every email in the connected
-- mailbox, plus a drafts delta cursor.
--
-- CrmMailboxEmail stores EVERY fetched email (not just CRM-matched), powering
-- the in-CRM Mailbox module (Inbox/Sent/Drafts/All) read entirely from the DB.
-- The CRM-matched tables (CrmEmailMessage/Thread) are untouched; crmEmailMessageId
-- cross-links a mirror row to its CRM-matched counterpart when one exists.
--
-- Idempotent (IF NOT EXISTS) so it is safe to apply by hand; the build pipeline
-- does not run `migrate deploy`. Mirrors the 20260716120000/20260717120000
-- convention. orgId-scoped; FKs to quikit."Org" and CrmMailboxConnection.

-- Drafts delta cursor (Microsoft Graph is per-folder).
ALTER TABLE app_quikcrm."CrmMailboxConnection"
  ADD COLUMN IF NOT EXISTS "deltaDrafts" text;

-- Raw mailbox mirror.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmMailboxEmail" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  "providerMessageId"   text NOT NULL,
  "providerThreadId"    text,
  folder                text NOT NULL,
  direction             text NOT NULL,
  "fromAddress"         text NOT NULL,
  "fromName"            text,
  "toAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "ccAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "bccAddresses"        text[] NOT NULL DEFAULT ARRAY[]::text[],
  subject               text,
  preview               text,
  "bodyHtml"            text,
  "bodyText"            text,
  "hasAttachments"      boolean NOT NULL DEFAULT false,
  attachments           jsonb,
  "receivedAt"          timestamp(3),
  "sentAt"              timestamp(3),
  "isRead"              boolean NOT NULL DEFAULT false,
  "isStarred"           boolean NOT NULL DEFAULT false,
  labels                text[] NOT NULL DEFAULT ARRAY[]::text[],
  "crmEmailMessageId"   text,
  "matchedKind"         text,
  "matchedObjectId"     text,
  "syncedAt"            timestamp(3) NOT NULL DEFAULT now(),
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"           timestamp(3) NOT NULL
);

-- @@unique([orgId, mailboxConnectionId, providerMessageId]) — dedupe guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_providerMessageId_key"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "providerMessageId");
-- @@index([orgId, mailboxConnectionId, folder, receivedAt]) — list views.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_folder_receivedAt_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "folder", "receivedAt");
-- @@index([orgId, mailboxConnectionId, isRead]) — unread badge/filter.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_isRead_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "isRead");
-- @@index([orgId, mailboxConnectionId, providerThreadId]) — detail thread.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_providerThreadId_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "providerThreadId");
