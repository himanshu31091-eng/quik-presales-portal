-- ============================================================================
-- QuikSupport (app_quiksupport) — full schema provisioning migration
-- ----------------------------------------------------------------------------
-- Purpose: bring a PRODUCTION database up to the current QuikSupport Prisma
--          schema (packages/database/prisma/schema.prisma, Hd*/Qsp* models).
--
-- This is an IDEMPOTENT rewrite of migration
--   20260702120000_quiksupport_init/migration.sql
-- It is safe to run on a database where the schema is missing, partially
-- present, or already fully applied — every statement is guarded
-- (IF NOT EXISTS / duplicate_object catch), so re-runs are no-ops.
--
-- Verified 2026-07-03 against the reference DB: 8 enums + 22 tables, all
-- columns/indexes/FKs match the Prisma schema exactly (no drift).
--
-- Run inside a single transaction. On psql:  \i this_file.sql
-- ============================================================================

BEGIN;

-- ─── Schema ──────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "app_quiksupport";

-- ─── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdUserRole" AS ENUM ('HELPDESK_ADMIN', 'CATEGORY_LEAD', 'AGENT', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdTicketStatus" AS ENUM ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdTicketPriority" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdTicketSource" AS ENUM ('portal', 'widget', 'api', 'email');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdMessageType" AS ENUM ('customer_reply', 'agent_reply', 'internal_note', 'status_update', 'system');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdNotificationEvent" AS ENUM ('ticket_created', 'ticket_assigned', 'status_changed', 'new_message', 'sla_at_risk', 'sla_breached', 'ticket_resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdMappingStatus" AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "app_quiksupport"."HdOperatingMode" AS ENUM ('integrated', 'standalone');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quiksupport"."tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logo_url" TEXT,
    "accent" TEXT NOT NULL DEFAULT '#10B981',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."apps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📦',
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "accent" TEXT NOT NULL DEFAULT '#EEF2FF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "app_quiksupport"."HdUserRole" NOT NULL DEFAULT 'CUSTOMER',
    "title" TEXT,
    "avatar_url" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366F1',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📁',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."subcategories" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."category_agents" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT,
    "user_id" TEXT NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "category_id" TEXT,
    "subcategory_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "app_quiksupport"."HdTicketStatus" NOT NULL DEFAULT 'open',
    "priority" "app_quiksupport"."HdTicketPriority" NOT NULL DEFAULT 'medium',
    "source" "app_quiksupport"."HdTicketSource" NOT NULL DEFAULT 'portal',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sla_due_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "message_type" "app_quiksupport"."HdMessageType" NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."attachments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."status_history" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "from_status" "app_quiksupport"."HdTicketStatus",
    "to_status" "app_quiksupport"."HdTicketStatus" NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."sla_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT,
    "priority" "app_quiksupport"."HdTicketPriority" NOT NULL,
    "first_response_hrs" DOUBLE PRECISION NOT NULL,
    "resolve_hrs" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sla_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "event" "app_quiksupport"."HdNotificationEvent" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."user_mappings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL DEFAULT '',
    "role_id" TEXT NOT NULL,
    "status" "app_quiksupport"."HdMappingStatus" NOT NULL DEFAULT 'active',
    "mode" "app_quiksupport"."HdOperatingMode" NOT NULL DEFAULT 'integrated',
    "metadata" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- QuikIT per-app RBAC layer (Qsp* models → canonical AppRole* table names)
CREATE TABLE IF NOT EXISTS "app_quiksupport"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,
    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quiksupport"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_code_key" ON "app_quiksupport"."tenants"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "apps_tenant_id_code_key" ON "app_quiksupport"."apps"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "users_tenant_id_email_idx" ON "app_quiksupport"."users"("tenant_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_id_external_id_key" ON "app_quiksupport"."users"("tenant_id", "external_id");
CREATE INDEX IF NOT EXISTS "categories_tenant_id_idx" ON "app_quiksupport"."categories"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_tenant_id_name_key" ON "app_quiksupport"."categories"("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "category_agents_category_id_tenant_id_idx" ON "app_quiksupport"."category_agents"("category_id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "category_agents_category_id_app_id_user_id_key" ON "app_quiksupport"."category_agents"("category_id", "app_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_ticket_number_key" ON "app_quiksupport"."tickets"("ticket_number");
CREATE INDEX IF NOT EXISTS "tickets_tenant_id_status_idx" ON "app_quiksupport"."tickets"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "tickets_tenant_id_app_id_idx" ON "app_quiksupport"."tickets"("tenant_id", "app_id");
CREATE INDEX IF NOT EXISTS "tickets_tenant_id_assigned_to_id_idx" ON "app_quiksupport"."tickets"("tenant_id", "assigned_to_id");
CREATE INDEX IF NOT EXISTS "tickets_tenant_id_requester_id_idx" ON "app_quiksupport"."tickets"("tenant_id", "requester_id");
CREATE INDEX IF NOT EXISTS "tickets_sla_due_at_idx" ON "app_quiksupport"."tickets"("sla_due_at");
CREATE INDEX IF NOT EXISTS "messages_ticket_id_idx" ON "app_quiksupport"."messages"("ticket_id");
CREATE INDEX IF NOT EXISTS "attachments_ticket_id_idx" ON "app_quiksupport"."attachments"("ticket_id");
CREATE INDEX IF NOT EXISTS "status_history_ticket_id_idx" ON "app_quiksupport"."status_history"("ticket_id");
CREATE INDEX IF NOT EXISTS "sla_configs_tenant_id_idx" ON "app_quiksupport"."sla_configs"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sla_configs_tenant_id_category_id_priority_key" ON "app_quiksupport"."sla_configs"("tenant_id", "category_id", "priority");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "app_quiksupport"."notifications"("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "roles_tenant_id_idx" ON "app_quiksupport"."roles"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "permissions_key_key" ON "app_quiksupport"."permissions"("key");
CREATE INDEX IF NOT EXISTS "role_permissions_role_id_idx" ON "app_quiksupport"."role_permissions"("role_id");
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_id_permission_id_key" ON "app_quiksupport"."role_permissions"("role_id", "permission_id");
CREATE INDEX IF NOT EXISTS "user_mappings_tenant_id_user_id_idx" ON "app_quiksupport"."user_mappings"("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "user_mappings_role_id_idx" ON "app_quiksupport"."user_mappings"("role_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_mappings_user_id_tenant_id_app_id_key" ON "app_quiksupport"."user_mappings"("user_id", "tenant_id", "app_id");
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_id_entity_entity_id_idx" ON "app_quiksupport"."audit_logs"("tenant_id", "entity", "entity_id");
CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx" ON "app_quiksupport"."AppRole"("orgId", "appId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key" ON "app_quiksupport"."AppRole"("orgId", "appId", "name");
CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "app_quiksupport"."RolePermission"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key" ON "app_quiksupport"."RolePermission"("roleId", "resource", "action");
CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx" ON "app_quiksupport"."RoleNavigation"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key" ON "app_quiksupport"."RoleNavigation"("roleId", "navKey");
CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx" ON "app_quiksupport"."UserAppRole"("roleId");
CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx" ON "app_quiksupport"."UserAppRole"("userId", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key" ON "app_quiksupport"."UserAppRole"("userId", "orgId", "roleId");
CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx" ON "app_quiksupport"."UserPermissionExtra"("userId", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quiksupport"."UserPermissionExtra"("orgId", "userId", "resource", "action");

-- ─── Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS → guarded) ─────────
DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."apps" ADD CONSTRAINT "apps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."subcategories" ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app_quiksupport"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."category_agents" ADD CONSTRAINT "category_agents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app_quiksupport"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."category_agents" ADD CONSTRAINT "category_agents_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "app_quiksupport"."apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."category_agents" ADD CONSTRAINT "category_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "app_quiksupport"."apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app_quiksupport"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "app_quiksupport"."subcategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."tickets" ADD CONSTRAINT "tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."messages" ADD CONSTRAINT "messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app_quiksupport"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."attachments" ADD CONSTRAINT "attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app_quiksupport"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app_quiksupport"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."status_history" ADD CONSTRAINT "status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app_quiksupport"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."status_history" ADD CONSTRAINT "status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."sla_configs" ADD CONSTRAINT "sla_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."sla_configs" ADD CONSTRAINT "sla_configs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app_quiksupport"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "app_quiksupport"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app_quiksupport"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "app_quiksupport"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."user_mappings" ADD CONSTRAINT "user_mappings_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app_quiksupport"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "app_quiksupport"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_quiksupport"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksupport"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksupport"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "app_quiksupport"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quiksupport"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;

-- ============================================================================
-- End of QuikSupport schema migration.
-- If you use Prisma's _prisma_migrations table for tracking, remember to mark
-- 20260702120000_quiksupport_init as applied on production (prisma migrate
-- resolve --applied 20260702120000_quiksupport_init) so `migrate deploy`
-- does not attempt to re-run it.
-- ============================================================================
