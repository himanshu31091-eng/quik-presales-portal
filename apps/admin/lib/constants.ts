export { ROLES, ROLE_HIERARCHY, ROLE_LABELS, MEMBERSHIP_STATUS, TENANT_PLANS } from "@quikit/shared";

export const PATHS = {
  home: "/",
  login: "/login",
  launcher: "/launcher",
  dashboard: "/dashboard",
  members: "/dashboard/members",
  member: (id: string) => `/dashboard/members/${id}`,
  teams: "/dashboard/teams",
  team: (id: string) => `/dashboard/teams/${id}`,
  apps: "/dashboard/apps",
  app: (appId: string) => `/dashboard/apps/${appId}`,
  roles: "/dashboard/roles",
  role: (roleId: string) => `/dashboard/roles/${roleId}`,
  settings: "/dashboard/settings",
  auditLog: "/dashboard/audit-log",
  invitationAccept: "/invitations/accept",
} as const;
