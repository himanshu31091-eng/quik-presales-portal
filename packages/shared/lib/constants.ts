export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  EXECUTIVE: "executive",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  COACH: "coach",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<string, number> = {
  [ROLES.SUPER_ADMIN]: 6,
  [ROLES.ADMIN]: 5,
  // v4 MEMBERSHIP_ROLES mapped into the legacy hierarchy. `org_admin` is
  // the new name for the legacy "admin" tier (same authority), so it gets
  // level 5. `app_admin` sits between admin and executive — it carries
  // admin-tier authority within its scoped apps but not org-wide. `member`
  // is the new default and lines up with `employee` at level 2.
  // Without these entries the shared `createRequireAdmin` factory would
  // 403 every org_admin/app_admin/member request even though the
  // middleware (which uses ADMIN_TIER_ROLES below) lets them through.
  org_admin: 5,
  app_admin: 4,
  member: 2,
  [ROLES.EXECUTIVE]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.EMPLOYEE]: 2,
  [ROLES.COACH]: 1,
};

export const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.EXECUTIVE]: "Executive",
  [ROLES.MANAGER]: "Manager",
  [ROLES.EMPLOYEE]: "Employee",
  [ROLES.COACH]: "Coach",
};

export const MEMBERSHIP_STATUS = {
  ACTIVE: "active",
  INVITED: "invited",
  INACTIVE: "inactive",
  DECLINED: "declined",
  PENDING: "pending",
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];

// ── v4 role split ──────────────────────────────────────────────────────────
// MEMBERSHIP_ROLES live on OrgMember.role (org-wide authority).
// Per-app authority lives on UserAppAccess.role (app-scoped — the value space
// depends on the specific app's domain, e.g. KPI editor in QuikScale).
//
// SuperAdmin is the platform-wide role (also reflected on User.isSuperAdmin).
// OrgAdmin can manage the organisation and access admin-tier apps (Admin
// Portal). Member is the default role.
//
// Migration: legacy ROLES (admin/executive/manager/employee/coach) remain for
// backwards-compat with existing app code. New code uses MEMBERSHIP_ROLES.

export const MEMBERSHIP_ROLES = {
  SUPER_ADMIN: "super_admin",
  ORG_ADMIN: "org_admin",
  APP_ADMIN: "app_admin",
  MEMBER: "member",
} as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[keyof typeof MEMBERSHIP_ROLES];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  [MEMBERSHIP_ROLES.SUPER_ADMIN]: "Super Admin",
  [MEMBERSHIP_ROLES.ORG_ADMIN]: "Org Admin",
  [MEMBERSHIP_ROLES.APP_ADMIN]: "App Admin",
  [MEMBERSHIP_ROLES.MEMBER]: "User",
};

/**
 * Roles that grant access to admin-tier apps (apps with App.requiresOrgAdmin = true).
 * super_admin and org_admin pass; app_admin and member do not. Also accepts the
 * legacy "admin" string for backwards compat with rows seeded before the rename.
 */
export const ADMIN_TIER_ROLES = new Set<string>([
  MEMBERSHIP_ROLES.SUPER_ADMIN,
  MEMBERSHIP_ROLES.ORG_ADMIN,
  "admin", // legacy — pre-2026-05-04 rows used this string
]);

// ── Invitation method (FRD §3.3, §3.4) ─────────────────────────────────────
// FRD requires the inviter (Superadmin or Org Admin) to choose between an SSO
// flow (Google / Microsoft) and a Native Email flow (default password +
// Set-Password screen on first login).
export const INVITE_METHOD = {
  SSO: "sso",
  NATIVE: "native",
} as const;
export type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];

// FRD §3.3 — SSO providers we recognise. Email-domain classification maps an
// invited address to one of these so the invitation email can render the right
// CTA ("Sign in with Google" vs "Sign in with Microsoft").
export const SSO_PROVIDER = {
  GOOGLE: "google",
  MICROSOFT: "microsoft",
} as const;
export type SsoProvider = (typeof SSO_PROVIDER)[keyof typeof SSO_PROVIDER];

// ── Domain status const-enums ──────────────────────────────────────────────
// These are TypeScript const objects (not Prisma enums) so they share the
// exact string literals used in the database without requiring a schema
// migration. Prefer these over magic strings in new code.

export const KPI_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;
export type KpiStatus = (typeof KPI_STATUS)[keyof typeof KPI_STATUS];

export const KPI_HEALTH_STATUS = {
  ON_TRACK: "on-track",
  AT_RISK: "at-risk",
  CRITICAL: "critical",
  COMPLETE: "complete",
} as const;
export type KpiHealthStatus = (typeof KPI_HEALTH_STATUS)[keyof typeof KPI_HEALTH_STATUS];

export const PRIORITY_STATUS = {
  NOT_APPLICABLE: "not-applicable",
  NOT_YET_STARTED: "not-yet-started",
  NOT_STARTED: "not-started",
  BEHIND_SCHEDULE: "behind-schedule",
  ON_TRACK: "on-track",
  COMPLETED: "completed",
} as const;
export type PriorityStatus = (typeof PRIORITY_STATUS)[keyof typeof PRIORITY_STATUS];

export const WWW_STATUS = {
  NOT_YET_STARTED: "not-yet-started",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  NOT_APPLICABLE: "not-applicable",
} as const;
export type WwwStatus = (typeof WWW_STATUS)[keyof typeof WWW_STATUS];

export const REVIEW_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  FINALIZED: "finalized",
} as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

export const OPSP_STATUS = {
  DRAFT: "draft",
  FINALIZED: "finalized",
} as const;
export type OpspStatus = (typeof OPSP_STATUS)[keyof typeof OPSP_STATUS];

export const KPI_LEVEL = {
  INDIVIDUAL: "individual",
  TEAM: "team",
} as const;
export type KpiLevel = (typeof KPI_LEVEL)[keyof typeof KPI_LEVEL];

export const QUARTER = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
} as const;
export type Quarter = (typeof QUARTER)[keyof typeof QUARTER];

export const MEASUREMENT_UNIT = {
  NUMBER: "Number",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
  RATIO: "Ratio",
} as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNIT)[keyof typeof MEASUREMENT_UNIT];

export const TENANT_PLANS = {
  STARTUP: "startup",
  GROWTH: "growth",
  ENTERPRISE: "enterprise",
} as const;

// ── Self-serve registration + subscription/trial ───────────────────────────
// Apps a brand-new self-serve workspace is granted on registration. Org Admins
// see every provisioned app in the launcher; these become the org's first
// OrgAppAccess rows. Adjust freely — slugs must exist in quikit.App.
export const DEFAULT_REGISTRATION_APP_SLUGS = ["quikcrm", "quiktrack", "admin"] as const;

// App slugs temporarily hidden from the Apps switcher + launcher UI. The apps
// stay in the catalog/DB and remain reachable by direct URL — this only removes
// them from the app-list surfaces (the in-app "Apps" waffle menu and the QuikIT
// launcher). Remove a slug here to unhide it.
export const HIDDEN_APP_SLUGS = ["quikvc", "quiksocial"] as const;

// Length of the free trial granted to a newly self-registered workspace.
export const TRIAL_DURATION_DAYS = 14;

// "Surprise gift" promo — when an app's trial has expired, the launcher offers a
// one-click gift that re-opens the trial for this many days (an extra month).
// Server-authoritative: the claim endpoint always uses THIS value, never a
// client-supplied one. Applies to every app uniformly.
export const SURPRISE_GIFT_TRIAL_DAYS = 30;

// Subscription.status value space. `trialing` + a future trialEndsAt grants
// access; an expired trial or any of past_due/canceled/expired gates the org.
// An org with NO Subscription row is grandfathered (treated as active).
export const SUBSCRIPTION_STATUS = {
  TRIALING: "trialing",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELED: "canceled",
  EXPIRED: "expired",
} as const;
export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const PATHS = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  ORGANISATIONS: "/dashboard/organisations",
  MEMBERS: "/dashboard/members",
  TEAMS: "/dashboard/teams",
  APPS: "/dashboard/apps",
  SETTINGS: "/dashboard/settings",
  ROLES: "/dashboard/roles",
} as const;
