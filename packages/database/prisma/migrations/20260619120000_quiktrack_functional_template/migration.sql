-- QuikTrack: Functional template support.
-- Adds two columns to QtProject:
--   templateKey  → which template the space was created from ("scrum" | "functional").
--                  Defaults to "scrum" so every existing space keeps Scrum behavior.
--   backlogName  → custom backlog heading, honored only for functional spaces
--                  (null → "Backlog").
-- Idempotent so it is safe to apply to the shared prod Neon DB by hand (the
-- build pipeline does not run `migrate deploy`).

ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "templateKey" text NOT NULL DEFAULT 'scrum';

ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "backlogName" text;
