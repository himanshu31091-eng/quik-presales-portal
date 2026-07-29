-- Adds a structured JSON settings blob to QtUserViewPref so per-user view
-- preferences richer than column hide/order (e.g. backlog "View settings":
-- epic panel, empty sprints, density, field toggles) persist server-side,
-- scoped per user, per org, per project via the existing
-- @@unique([userId, projectId, viewKey]). Nullable + no default: existing
-- rows stay valid, new settings rows populate it.
ALTER TABLE app_quiktrack."QtUserViewPref" ADD COLUMN "settings" JSONB;
