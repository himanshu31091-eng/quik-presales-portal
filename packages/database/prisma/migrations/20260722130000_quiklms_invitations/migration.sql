-- QuikLMS: add a local record of every invitation the app sends.
--
-- WHY: QuikLMS had no invitations table at all. Invites were fire-and-forget —
-- provision the identity, send the mail, forget. So a tenant admin could not
-- answer "was this teacher invited, when, by whom, and has it expired?", there
-- was no way to revoke a pending invite, and nothing recorded that a mail had
-- ever been dispatched. Every other app that invites people keeps this record;
-- app_quikhrms.Invitation is the reference.
--
-- WHAT THIS IS NOT: the authoritative invitation. The membership lifecycle
-- lives on quikit.OrgMember (status / invitationToken / invitedAt / acceptedAt)
-- and the central accept endpoint is what activates it. These rows are a
-- shadow, so the LMS can list and audit invitations without querying the
-- platform tables on every render.
--
-- TOKEN HANDLING: `token` stores a SHA-256 HASH of the emailed central token,
-- never the raw value. This deliberately diverges from HrmsInvitation, which
-- also persists the raw `centralInviteToken` for resend convenience. The raw
-- token already exists on quikit.OrgMember (the accept endpoint looks it up by
-- value), so copying it here would place a second live credential in a second
-- table for no gain — a resend re-reads the source of truth instead.
--
-- SAFETY: purely additive. One enum type and one new table in the app_quiklms
-- schema; touches no existing table, column, row or constraint. No foreign
-- keys: orgId / invitedBy / lmsUserId are scalars, matching how every other
-- Lms* table stores cross-schema references.

-- CreateEnum
CREATE TYPE "app_quiklms"."LmsInvitationStatus" AS ENUM ('Pending', 'Accepted', 'Expired', 'Revoked');

-- CreateTable
CREATE TABLE "app_quiklms"."invitations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "app_quiklms"."LmsInvitationStatus" NOT NULL DEFAULT 'Pending',
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lmsUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "app_quiklms"."invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_orgId_status_idx" ON "app_quiklms"."invitations"("orgId", "status");

-- CreateIndex
CREATE INDEX "invitations_orgId_email_idx" ON "app_quiklms"."invitations"("orgId", "email");
