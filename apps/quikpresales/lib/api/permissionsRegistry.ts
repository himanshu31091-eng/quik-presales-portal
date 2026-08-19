/**
 * Local permission tree registry — single source of truth for QuikPreSales
 * Roles & Permissions v2.
 *
 * Mirrors apps/quiktrack/lib/api/permissionsRegistry.ts so the Manage
 * Permissions UI renders this app's matrix the same way it renders the
 * others'. Lives here rather than in @quikit/shared because resource
 * semantics belong to the app that owns them.
 *
 * Shape: PERMISSION_TREE → Module[] → leaves[{ resource, label, actions }].
 * Resource keys map onto the flat PsRolePermission(resource, action) table.
 *
 * Client-safe: no imports of server-only modules, so the roles UI can import
 * the tree directly.
 */

/* ───────────────────────── Action vocabulary ───────────────────────── */

export const ACTIONS = ["view", "create", "update", "delete", "approve", "manage"] as const;
export type Action = (typeof ACTIONS)[number];

/** The four actions every ordinary CRUD resource supports. */
export const CRUD: readonly Action[] = ["view", "create", "update", "delete"];

/* ───────────────────────────── Resources ───────────────────────────── */

export const RESOURCES = [
  "engagements",
  "rfp",
  "proposals",
  "templates",
  "demos",
  "knowledge",
  "estimates",
  "winloss",
  "dashboard",
  "settings",
] as const;
export type Resource = (typeof RESOURCES)[number];

export interface PermissionLeaf {
  resource: Resource;
  label: string;
  actions: readonly Action[];
}

export interface PermissionModule {
  key: string;
  label: string;
  leaves: PermissionLeaf[];
}

export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "pipeline",
    label: "Pipeline",
    leaves: [
      // `approve` is the pre-sales accept/reject gate on an incoming lead.
      // Sales can create engagements but must not decide them.
      { resource: "engagements", label: "Engagements", actions: [...CRUD, "approve"] },
      { resource: "rfp", label: "RFP Manager", actions: CRUD },
      // `approve` moves a proposal into the approved state; `update` covers
      // every other status move and all content edits.
      { resource: "proposals", label: "Proposals", actions: [...CRUD, "approve"] },
      { resource: "estimates", label: "Cost Estimator", actions: CRUD },
    ],
  },
  {
    key: "library",
    label: "Library",
    leaves: [
      { resource: "templates", label: "Templates", actions: CRUD },
      { resource: "demos", label: "Demo Library", actions: CRUD },
      { resource: "knowledge", label: "Knowledge Repository", actions: CRUD },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    leaves: [
      { resource: "winloss", label: "Win / Loss", actions: CRUD },
      { resource: "dashboard", label: "Dashboards", actions: ["view"] },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    leaves: [{ resource: "settings", label: "Roles & Settings", actions: ["view", "manage"] }],
  },
];

/* ───────────────────────────── Type guards ─────────────────────────── */

const RESOURCE_SET = new Set<string>(RESOURCES);
const ACTION_SET = new Set<string>(ACTIONS);

export function isResource(value: string): value is Resource {
  return RESOURCE_SET.has(value);
}

export function isAction(value: string): value is Action {
  return ACTION_SET.has(value);
}

/* ─────────────────────────────── Helpers ───────────────────────────── */

export function walkLeaves(): PermissionLeaf[] {
  return PERMISSION_TREE.flatMap((m) => m.leaves);
}

/** Every valid (resource, action) pair — the grant set for `presales_admin`. */
export function allPermissionPairs(): { resource: Resource; action: Action }[] {
  return walkLeaves().flatMap((leaf) =>
    leaf.actions.map((action) => ({ resource: leaf.resource, action })),
  );
}

/** True when the leaf for `resource` actually declares `action`. */
export function isValidPair(resource: string, action: string): boolean {
  if (!isResource(resource) || !isAction(action)) return false;
  const leaf = walkLeaves().find((l) => l.resource === resource);
  return !!leaf && leaf.actions.includes(action);
}

/* ────────────────────────────── Navigation ─────────────────────────── */

/**
 * Sidebar keys. Resolution mirrors quiktrack/quikscale:
 *   - a key in NAV_TO_ENTITY is satisfied by a `view` grant on that resource,
 *     so the permission matrix stays the single source of truth
 *   - anything else is a pure-navigation item and must be granted explicitly
 *     in `PsRoleNavigation`
 */
export const NAV_TO_ENTITY: Record<string, Resource> = {
  leads: "engagements",
  engagements: "engagements",
  rfp: "rfp",
  proposals: "proposals",
  estimates: "estimates",
  "library.templates": "templates",
  "library.demos": "demos",
  "library.knowledge": "knowledge",
  winloss: "winloss",
  settings: "settings",
  team: "dashboard",
};

/** Pure-navigation keys — no backing resource, granted via RoleNavigation. */
export const NAV_KEYS: readonly string[] = ["dashboard", "library", "weekly"];

const NAV_KEY_SET = new Set<string>(NAV_KEYS);

export function isNavKey(value: string): boolean {
  return NAV_KEY_SET.has(value);
}

/* ──────────────────────────── Default roles ────────────────────────── */

/**
 * The platform app-admin role.
 *
 * Every QuikIT app seeds exactly one role literally named `admin` with
 * `isSystem: true` — quikscale, quiktrack, quikinfra, quiklms, quikhrms,
 * quiksupport and quikasset all do. The Admin Portal's Roles screen splits on
 * `isSystem`, so this is the row that renders under "System Roles"; every
 * domain role below is a Custom Role.
 *
 * The name and the flag are both load-bearing: `isPreSalesAppAdmin` matches on
 * `{ name: "admin", isSystem: true }`, exactly as `isQuikTrackAppAdmin` does.
 */
export const APP_ADMIN_ROLE_NAME = "admin";

/** Domain roles. Custom (isSystem: false) — same shape as quiklms's roster. */
export const PRESALES_ADMIN_ROLE_NAME = "presales_admin";

/** Roles the seeder owns. Protected from rename/delete by the roles API. */
export const SEEDED_ROLE_NAMES: readonly string[] = [
  APP_ADMIN_ROLE_NAME,
  PRESALES_ADMIN_ROLE_NAME,
  "presales_engineer",
  "solution_architect",
  "sales_exec",
  "delivery_manager",
  "leadership",
];

/** Role assigned to a user on first app access when they have none. */
export const DEFAULT_ROLE_NAME = "sales_exec";

export interface DefaultRoleDef {
  name: string;
  description: string;
  isDefault: boolean;
  /** Resource grants. `null` means every pair, via allPermissionPairs(). */
  grants: Partial<Record<Resource, readonly Action[]>> | null;
  /** Pure-navigation keys granted to this role (PsRoleNavigation rows). */
  nav: readonly string[];
}

const VIEW_ONLY: Partial<Record<Resource, readonly Action[]>> = {
  engagements: ["view"],
  rfp: ["view"],
  proposals: ["view"],
  templates: ["view"],
  demos: ["view"],
  knowledge: ["view"],
  estimates: ["view"],
  winloss: ["view"],
  dashboard: ["view"],
};

/**
 * The role → grant matrix from the implementation spec §7.
 *
 * These are all CUSTOM roles (`isSystem: false`) — the platform reserves
 * `isSystem` for the single `admin` role, so these render under "Custom Roles"
 * in the Admin Portal alongside quiklms's TENANT_ADMIN / SUB_ADMIN etc.
 *
 * `grants: null` means "every pair", derived from allPermissionPairs() so a
 * newly-added resource is covered without editing this table.
 */
export const DEFAULT_ROLES: DefaultRoleDef[] = [
  {
    name: PRESALES_ADMIN_ROLE_NAME,
    description: "Full pre-sales access — templates, demos, AI config, all engagements.",
    isDefault: false,
    grants: null,
    nav: [...NAV_KEYS],
  },
  {
    name: "presales_engineer",
    description: "Builds proposals, runs the RFP flow, preps demos.",
    isDefault: false,
    grants: {
      engagements: ["view", "create", "update", "approve"],
      rfp: ["view", "create", "update"],
      proposals: ["view", "create", "update"],
      templates: ["view"],
      demos: ["view", "create", "update"],
      knowledge: ["view", "create", "update"],
      estimates: ["view", "create", "update"],
      winloss: ["view", "create", "update"],
      dashboard: ["view"],
    },
    nav: ["dashboard", "library", "weekly"],
  },
  {
    name: "solution_architect",
    description: "Reviews and approves solution design, architecture and estimates.",
    isDefault: false,
    grants: {
      engagements: ["view", "update", "approve"],
      rfp: ["view", "update"],
      proposals: ["view", "update", "approve"],
      templates: ["view"],
      demos: ["view"],
      knowledge: ["view", "create", "update"],
      estimates: ["view", "update"],
      winloss: ["view"],
      dashboard: ["view"],
    },
    nav: ["dashboard", "library", "weekly"],
  },
  {
    name: "sales_exec",
    description: "Raises engagements, uploads RFPs, tracks progress.",
    isDefault: true,
    grants: {
      engagements: ["view", "create"],
      rfp: ["view", "create"],
      proposals: ["view"],
      templates: ["view"],
      demos: ["view"],
      knowledge: ["view"],
      estimates: ["view"],
      winloss: ["view", "create"],
      dashboard: ["view"],
    },
    nav: ["dashboard", "library"],
  },
  {
    name: "delivery_manager",
    description: "Read-only visibility for resourcing and POC handoff planning.",
    isDefault: false,
    grants: VIEW_ONLY,
    nav: ["dashboard", "library"],
  },
  {
    name: "leadership",
    description: "Read-only dashboards, pipeline and win/loss.",
    isDefault: false,
    grants: VIEW_ONLY,
    nav: ["dashboard", "weekly"],
  },
];
