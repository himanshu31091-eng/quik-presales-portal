-- QuikTrack in-app notifications, per-user notification settings, issue watchers.

CREATE TABLE app_quiktrack."QtUserNotificationSetting" (
  id                    TEXT PRIMARY KEY,
  "userId"              TEXT NOT NULL UNIQUE,
  "digestCadence"       TEXT NOT NULL DEFAULT 'none',
  "lastDigestAt"        TIMESTAMP(3),
  "inAppEnabled"        BOOLEAN NOT NULL DEFAULT TRUE,
  "emailInstantEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL
);

CREATE TABLE app_quiktrack."QtNotification" (
  id            TEXT PRIMARY KEY,
  "orgId"       TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId"     TEXT,
  tab           TEXT NOT NULL DEFAULT 'direct',
  type          TEXT NOT NULL,
  "projectId"   TEXT,
  "issueId"     TEXT,
  "issueKey"    TEXT,
  "issueTitle"  TEXT,
  "commentId"   TEXT,
  snippet       TEXT,
  "fromValue"   TEXT,
  "toValue"     TEXT,
  "isRead"      BOOLEAN NOT NULL DEFAULT FALSE,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "QtNotification_recipient_tab_read_created_idx"
  ON app_quiktrack."QtNotification"("recipientId", tab, "isRead", "createdAt");
CREATE INDEX "QtNotification_recipient_created_idx"
  ON app_quiktrack."QtNotification"("recipientId", "createdAt");
CREATE INDEX "QtNotification_org_created_idx"
  ON app_quiktrack."QtNotification"("orgId", "createdAt");
CREATE INDEX "QtNotification_issue_idx"
  ON app_quiktrack."QtNotification"("issueId");

CREATE TABLE app_quiktrack."QtIssueWatcher" (
  id          TEXT PRIMARY KEY,
  "orgId"     TEXT NOT NULL,
  "issueId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'AUTO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "QtIssueWatcher_issue_user_key"
  ON app_quiktrack."QtIssueWatcher"("issueId", "userId");
CREATE INDEX "QtIssueWatcher_user_idx"
  ON app_quiktrack."QtIssueWatcher"("userId");
CREATE INDEX "QtIssueWatcher_issue_idx"
  ON app_quiktrack."QtIssueWatcher"("issueId");
