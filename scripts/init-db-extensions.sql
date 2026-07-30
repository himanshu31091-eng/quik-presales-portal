-- Postgres extensions the shared schema depends on.
--
-- schema.prisma uses uuid_generate_v4() as a column default, which lives in
-- uuid-ossp, and pgcrypto is required by the auth tables. Neither is enabled by
-- default on a new Postgres database, so `prisma db push` against a fresh one
-- fails with:
--
--   ERROR: function uuid_generate_v4() does not exist
--
-- On developer machines these were created by hand, which is why the failure
-- only ever shows up on a brand-new database (a new cloud instance, a fresh
-- container, or a new contributor's first setup). Run this before the first
-- push; it is idempotent, so running it again is harmless.
--
--   npx prisma db execute --schema=packages/database/prisma/schema.prisma \
--     --file scripts/init-db-extensions.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
