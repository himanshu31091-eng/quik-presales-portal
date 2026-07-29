import { z } from "zod";
import { INVITE_METHOD, MEMBERSHIP_ROLES } from "@quikit/shared";

// ─── Organizations ────────────────────────────────────────────────────────────

const inviteMethodEnum = z.enum([INVITE_METHOD.SSO, INVITE_METHOD.NATIVE]);

/**
 * FR-SA-001 — single-shot org creation. Required fields per the FRD's
 * "Create New Organization" form: org name, first/last name of the Org Admin,
 * application access (multi-select, ≥1), and invitation method.
 *
 * The legacy `slug` / `plan` / `billingEmail` / `description` fields are kept
 * optional so existing super-admin tooling that hits this same endpoint
 * without an admin block continues to work — the slug is derived from the
 * name when omitted.
 */
export const createOrgSchema = z
  .object({
    name: z.string().min(1, "Organization name is required").max(100),
    slug: z
      .string()
      .max(50)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only")
      .optional(),
    plan: z.enum(["startup", "growth", "enterprise"]).default("startup"),
    billingEmail: z.string().email("Invalid email").optional().nullable(),
    description: z.string().max(500).optional().nullable(),

    /// FR-SA-002 — at least one application must be selected. If omitted,
    /// the API skips the OrgAdmin invite step and only creates the org
    /// (legacy callers).
    appIds: z.array(z.string().min(1)).optional(),

    /// FR-SA-003 — the OrgAdmin block. Optional because legacy callers
    /// create the org first and invite separately, but if provided, all
    /// fields are required together.
    admin: z
      .object({
        firstName: z
          .string()
          .min(1, "First name is required")
          .max(50)
          .regex(/^[A-Za-z\s'\-]+$/, "First name may contain only letters, spaces, apostrophes, and hyphens"),
        lastName: z
          .string()
          .min(1, "Last name is required")
          .max(50)
          .regex(/^[A-Za-z\s'\-]+$/, "Last name may contain only letters, spaces, apostrophes, and hyphens"),
        email: z.string().email("Invalid email"),
        inviteMethod: inviteMethodEnum,
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    // FR-SA-002 — when an admin is being invited, app access must be specified.
    if (data.admin && (!data.appIds || data.appIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["appIds"],
        message: "Select at least one application for this organisation",
      });
    }
  });

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.enum(["startup", "growth", "enterprise"]).optional(),
  status: z.enum(["active", "suspended", "archived"]).optional(),
  billingEmail: z.string().email().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

// ─── App Registry ─────────────────────────────────────────────────────────────

export const createAppSchema = z.object({
  name: z.string().min(1, "App name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().max(500).optional().nullable(),
  baseUrl: z.string().url("Invalid URL"),
  status: z.enum(["active", "coming_soon", "disabled"]).default("active"),
});

export const updateAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  baseUrl: z.string().url().optional(),
  status: z.enum(["active", "coming_soon", "disabled"]).optional(),
});

// ─── Platform Users ───────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isSuperAdmin: z.boolean().default(false),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  isSuperAdmin: z.boolean().optional(),
});

// ─── Direct Add Member (FR-SA-011) ────────────────────────────────────────────
// Lets a Superadmin add a member to any org from the org-detail "Add Member"
// drawer. The member is created in "active" status immediately (direct-add):
//   - Native invite → User seeded with a temp password (mustChangePassword=true),
//     routed through the Set-Password screen on first login.
//   - SSO invite    → passwordless User; signs in via Google/Microsoft OAuth.
//
// firstName/lastName are OPTIONAL: the drawer intentionally defers names to the
// member's first login (/complete-profile). Roles are limited to Org Admin and
// Member per product requirement; promoting to org_admin cascades per-app admin
// (see lib/memberRoleSync.ts).

const orgMemberNameField = z
  .string()
  .max(50)
  .regex(/^[A-Za-z\s'\-]*$/, "Name may contain only letters, spaces, apostrophes, and hyphens")
  .optional()
  .default("");

export const directAddMemberSchema = z.object({
  orgId: z.string().min(1, "Organisation is required"),
  email: z.string().email("Invalid email"),
  firstName: orgMemberNameField,
  lastName: orgMemberNameField,
  role: z.enum([MEMBERSHIP_ROLES.ORG_ADMIN, MEMBERSHIP_ROLES.MEMBER]),
  inviteMethod: inviteMethodEnum.default(INVITE_METHOD.NATIVE),
  appIds: z.array(z.string().min(1)).default([]),
});

// ─── Update Member Role (Req 1) ───────────────────────────────────────────────
// Flip an existing member between Org Admin and Member from the org-detail
// page. The change cascades to per-app admin access (see lib/memberRoleSync.ts).

export const updateMemberRoleSchema = z.object({
  userId: z.string().min(1, "User is required"),
  role: z.enum([MEMBERSHIP_ROLES.ORG_ADMIN, MEMBERSHIP_ROLES.MEMBER]),
});
