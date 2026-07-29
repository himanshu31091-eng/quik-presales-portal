-- QuikLMS: drop the vestigial credential + session state from app_quiklms.users,
-- and the local OTP table.
--
-- ⚠️ DESTRUCTIVE. This drops columns and a table. Read the notes before applying
-- to any environment you cannot restore.
--
-- WHY: under centralized auth, credentials are owned solely by `auth.User` and
-- session revocation is the shared Redis `sessionId` (baseline §2 / §5). These
-- columns were a SECOND, unsynchronised identity store sitting inside the LMS
-- schema:
--
--   password                  duplicated auth.User.password
--   mustChangePassword        duplicated auth.User.mustChangePassword
--   passwordSetupToken        duplicated auth.VerificationToken
--   passwordSetupTokenExpiry  ditto
--   provider / providerId     duplicated auth.Account
--   activeSessionId           duplicated the shared Redis sessionId
--
-- Nothing read them at runtime. The only writer was `registerUser`, which
-- filled `password` with a throwaway `stub:<random>` value purely to satisfy the
-- NOT-NULL-less column; that write is removed in the same change. They were
-- vestigial but LIVE — any future code path could have started trusting them,
-- which is precisely the risk of leaving a shadow credential store in place.
--
-- `otps` backed a local email-OTP login that centralized auth retired: the
-- platform's registration OTP is Redis-backed and owned by apps/auth (§8A). The
-- table had no writer — only a worker cron deleting expired rows, removed here.
--
-- DATA AT TIME OF WRITING (local dev database, 32 user rows):
--   password                 32 non-null — 19 `stub:` placeholders, 13 real
--                            bcrypt hashes inherited from the pre-fold
--                            standalone LMS seed/ETL
--   passwordSetupToken       2 non-null
--   passwordSetupTokenExpiry 2 non-null
--   activeSessionId          3 non-null
--   provider / providerId    0 non-null
--   otps                     0 rows
--
-- ⚠️ BEFORE APPLYING TO UAT / PRODUCTION: `app_quiklms.users.password` may hold
-- real legacy bcrypt hashes from the standalone `quikskill_lms` database. They
-- are unusable by this application — login is SSO-only — but if anyone wants
-- them for an audit or a migration, EXPORT THEM FIRST. This migration cannot be
-- reversed by re-running Prisma; recovery means restoring from a backup.
--   Suggested export:
--     \copy (SELECT id, email, "password", "passwordSetupToken",
--            "passwordSetupTokenExpiry", "activeSessionId"
--            FROM app_quiklms.users) TO 'quiklms_auth_columns.csv' CSV HEADER
--
-- SAFETY: touches only the app_quiklms schema. No other table, and no central
-- (`auth`/`quikit`) object, is affected. No foreign key references any of these
-- columns or the otps table.

-- DropTable
DROP TABLE "app_quiklms"."otps";

-- AlterTable
ALTER TABLE "app_quiklms"."users"
  DROP COLUMN "password",
  DROP COLUMN "mustChangePassword",
  DROP COLUMN "passwordSetupToken",
  DROP COLUMN "passwordSetupTokenExpiry",
  DROP COLUMN "provider",
  DROP COLUMN "providerId",
  DROP COLUMN "activeSessionId";
