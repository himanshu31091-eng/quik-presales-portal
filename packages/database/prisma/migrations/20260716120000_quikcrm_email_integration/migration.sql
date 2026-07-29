-- QuikCRM: Email integration (P1) — connected mailbox + threaded messages.
--
-- Per-user Gmail / Microsoft 365 mailbox connected via OAuth. Two-way sync:
-- send from CRM records and poll inbox/sent for replies. Each synced/sent
-- message also produces a CrmActivity (type "email", sourceSystem=provider,
-- externalId=providerMessageId) — that table already has the
-- @@unique([orgId, sourceSystem, externalId]) dedupe key, so no timeline schema
-- change is needed here. OAuth tokens are stored AES-256-GCM encrypted
-- (accessTokenEnc / refreshTokenEnc) — never plaintext, never passwords.
--
-- Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`. Mirrors
-- the 20260623120000_quikcrm_activity_types convention. Index/constraint names
-- match Prisma's generated names for @@unique / @@index so the client stays in
-- sync with the DB. All tables are orgId-scoped, FK orgId -> quikit."Org".

-- ── Connected mailbox (one per user in P1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmMailboxConnection" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  provider          text NOT NULL,
  "emailAddress"    text NOT NULL,
  "accessTokenEnc"  text NOT NULL,
  "refreshTokenEnc" text NOT NULL,
  "tokenExpiresAt"  timestamp(3),
  scope             text,
  status            text NOT NULL DEFAULT 'active',
  "historyId"       text,
  "deltaLink"       text,
  "lastSyncedAt"    timestamp(3),
  "lastError"       text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @@unique([orgId, userId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmMailboxConnection_orgId_userId_key"
  ON app_quikcrm."CrmMailboxConnection" ("orgId", "userId");
-- @@index([orgId, status])
CREATE INDEX IF NOT EXISTS "CrmMailboxConnection_orgId_status_idx"
  ON app_quikcrm."CrmMailboxConnection" ("orgId", "status");

-- ── Conversation thread ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailThread" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  "providerThreadId"    text NOT NULL,
  subject               text,
  "relatedKind"         text NOT NULL,
  "relatedObjectId"     text NOT NULL,
  "lastMessageAt"       timestamp(3),
  "messageCount"        integer NOT NULL DEFAULT 0,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"           timestamp(3) NOT NULL
);

-- @@unique([orgId, mailboxConnectionId, providerThreadId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmEmailThread_orgId_mailboxConnectionId_providerThreadId_key"
  ON app_quikcrm."CrmEmailThread" ("orgId", "mailboxConnectionId", "providerThreadId");
-- @@index([orgId, relatedKind, relatedObjectId])
CREATE INDEX IF NOT EXISTS "CrmEmailThread_orgId_relatedKind_relatedObjectId_idx"
  ON app_quikcrm."CrmEmailThread" ("orgId", "relatedKind", "relatedObjectId");

-- ── Message (sent or received) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailMessage" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  "threadId"            text NOT NULL REFERENCES app_quikcrm."CrmEmailThread"(id) ON DELETE CASCADE,
  "providerMessageId"   text NOT NULL,
  "rfcMessageId"        text,
  "inReplyTo"           text,
  direction             text NOT NULL,
  "fromAddress"         text NOT NULL,
  "toAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "ccAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  subject               text,
  snippet               text,
  "bodyHtml"            text,
  "bodyText"            text,
  "sentAt"              timestamp(3),
  "receivedAt"          timestamp(3),
  "activityId"          text,
  "relatedKind"         text NOT NULL,
  "relatedObjectId"     text NOT NULL,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now()
);

-- @@unique([orgId, mailboxConnectionId, providerMessageId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_mailboxConnectionId_providerMessageId_key"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "mailboxConnectionId", "providerMessageId");
-- @@index([orgId, threadId])
CREATE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_threadId_idx"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "threadId");
-- @@index([orgId, relatedKind, relatedObjectId])
CREATE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_relatedKind_relatedObjectId_idx"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "relatedKind", "relatedObjectId");

-- ── Attachment (metadata; bytes fetched lazily on download) ──────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailAttachment" (
  id                     text PRIMARY KEY,
  "orgId"                text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "messageId"            text NOT NULL REFERENCES app_quikcrm."CrmEmailMessage"(id) ON DELETE CASCADE,
  filename               text NOT NULL,
  "mimeType"             text,
  "sizeBytes"            integer,
  "providerAttachmentId" text,
  "storageUrl"           text,
  "createdAt"            timestamp(3) NOT NULL DEFAULT now()
);

-- @@index([orgId, messageId])
CREATE INDEX IF NOT EXISTS "CrmEmailAttachment_orgId_messageId_idx"
  ON app_quikcrm."CrmEmailAttachment" ("orgId", "messageId");
