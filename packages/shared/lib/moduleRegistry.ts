/**
 * Module registry — single source of truth for every app's module tree.
 *
 * Used by:
 *   - Super admin "App Feature Flags" UI to render the toggle tree.
 *   - Each app's sidebar to filter which modules/sub-modules render.
 *   - `packages/auth/feature-gate` to check which routes should 404/redirect.
 *
 * Keys are dot-delimited: parent `"kpi"`, child `"kpi.teams"`. The dot-based
 * hierarchy is used by the cascade rule in `isModuleEnabled`: a module renders
 * only if it AND every ancestor are enabled.
 *
 * Icons are referenced by string name (Lucide icon component name). Sidebar
 * renderers resolve the string to a component. Keeps this package
 * client-safe (no React/lucide imports).
 *
 * See docs/plans/FF-1-app-feature-flags.md.
 */

export interface ModuleDef {
  /** Stable identifier used in the DB and in gate checks. NEVER change once set. */
  key: string;
  /** Human-readable label rendered in sidebar + super admin toggle tree. */
  label: string;
  /** Lucide icon name (resolved to component by the consumer). */
  icon?: string;
  /** Route path when clicked. Absent on parent-only modules (e.g., "kpi" is a header). */
  href?: string;
  /** Parent key for sub-modules. Derived from the dot-prefix but stated explicitly for clarity. */
  parentKey?: string;
  /**
   * Section the top-level module belongs to (e.g., "Execution", "Strategy",
   * "People", "Cash" — the Scaling Up pillars). Set only on top-level modules
   * (those without a `parentKey`); children inherit their parent's section.
   * Modules above the first section (e.g., Dashboard, Org Setup) leave this
   * undefined. Renderers group consecutive top-level modules under a section
   * header whenever this value changes.
   */
  section?: string;
  /**
   * When true, the module is OFF by default for every organization — including
   * newly-created orgs — without needing any AppModuleFlag row. A super admin
   * can still turn it on for a specific tenant: an explicit `enabled: true`
   * AppModuleFlag row lifts the default. (This inverts the normal sparse
   * convention, where a module is on unless a row says otherwise.)
   * The default-off/override logic lives in `computeDisabledModules`.
   */
  defaultDisabled?: boolean;
}

export interface AppModuleConfig {
  /** Matches `App.slug` in the database. */
  appSlug: string;
  /** Flat list; hierarchy inferred from `parentKey` / dot-prefix. */
  modules: ModuleDef[];
}

export const MODULE_REGISTRY: AppModuleConfig[] = [
  {
    appSlug: "quikscale",
    // Order + sections mirror the QuikScale sidebar (Scaling Up pillars).
    // Top of list (Dashboard, Org Setup) sits above the first section header.
    modules: [
      { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },

      { key: "orgSetup", label: "Org Setup", icon: "Building2" },
      { key: "orgSetup.teams", label: "Teams", icon: "Users", href: "/org-setup/teams", parentKey: "orgSetup" },
      { key: "orgSetup.users", label: "Users", icon: "User", href: "/org-setup/users", parentKey: "orgSetup" },
      { key: "orgSetup.quarters", label: "Quarter Settings", icon: "CalendarDays", href: "/org-setup/quarters", parentKey: "orgSetup" },

      /* ─── Execution ─── */
      { key: "kpi", label: "KPI", icon: "Target", section: "Execution" },
      { key: "kpi.individual", label: "Individual KPI", icon: "User", href: "/kpi", parentKey: "kpi" },
      { key: "kpi.teams", label: "Teams KPI", icon: "Users", href: "/kpi/teams", parentKey: "kpi" },

      { key: "priority", label: "Priority", icon: "CheckSquare", href: "/priority", section: "Execution" },

      { key: "www", label: "WWW", icon: "Activity", href: "/www", section: "Execution" },

      { key: "clientMeetings", label: "Meeting Rhythm", icon: "Calendar", section: "Execution" },
      { key: "clientMeetings.dashboard",     label: "Dashboard",       icon: "LayoutDashboard", href: "/client-meetings",                parentKey: "clientMeetings" },
      { key: "clientMeetings.clients",       label: "Client Master",   icon: "Users",           href: "/client-meetings/clients",        parentKey: "clientMeetings" },
      { key: "clientMeetings.members",       label: "Client Members",  icon: "User",            href: "/client-meetings/members",        parentKey: "clientMeetings" },
      { key: "clientMeetings.dailyHuddle",   label: "Daily Huddle",    icon: "Clock",           href: "/client-meetings/daily-huddle",   parentKey: "clientMeetings" },
      { key: "clientMeetings.weeklyMeeting", label: "Weekly Meeting",  icon: "CalendarDays",    href: "/client-meetings/weekly-meeting", parentKey: "clientMeetings" },

      { key: "analytics", label: "Analytics", icon: "TrendingUp", section: "Execution" },
      { key: "analytics.scorecard", label: "Scorecard", icon: "BarChart2", href: "/performance/scorecard", parentKey: "analytics" },
      { key: "analytics.individual", label: "Individual", icon: "User", href: "/performance/individual", parentKey: "analytics" },
      { key: "analytics.teams", label: "Teams", icon: "Users", href: "/performance/teams", parentKey: "analytics" },
      { key: "analytics.trends", label: "Trends", icon: "LineChart", href: "/performance/trends", parentKey: "analytics" },

      /* ─── Strategy ─── */
      { key: "opsp", label: "OPSP", icon: "FileText", section: "Strategy" },
      { key: "opsp.create", label: "Create OPSP", icon: "FileText", href: "/opsp", parentKey: "opsp" },
      { key: "opsp.history", label: "OPSP History", icon: "BookOpen", href: "/opsp/history", parentKey: "opsp" },
      { key: "opsp.review", label: "OPSP Review", icon: "Star", href: "/opsp/review", parentKey: "opsp" },
      { key: "opsp.categories", label: "Category Mgmt", icon: "List", href: "/opsp/categories", parentKey: "opsp" },

      { key: "habits", label: "Habits", icon: "Activity", href: "/performance/habits", section: "Strategy" },
      { key: "swt", label: "SWT", icon: "BarChart2", href: "/performance/swt", section: "Strategy" },

      /* ─── People ─── */
      { key: "people", label: "Goals & Pillars", icon: "Target", section: "People" },
      { key: "people.cycle", label: "Cycle", icon: "Activity", href: "/performance/cycle", parentKey: "people" },
      { key: "people.self", label: "Self-Assessment", icon: "User", href: "/performance/self", parentKey: "people" },
      { key: "people.reviews", label: "Reviews", icon: "ClipboardList", href: "/performance/reviews", parentKey: "people" },
      { key: "people.oneOnOne", label: "1:1 Meetings", icon: "Users", href: "/performance/one-on-one", parentKey: "people" },
      { key: "people.feedback", label: "Feedback", icon: "MessageSquare", href: "/performance/feedback", parentKey: "people" },
      { key: "people.talent", label: "Talent", icon: "Layers", href: "/performance/talent", parentKey: "people" },

      { key: "face", label: "FACe", icon: "UserCheck", href: "/performance/face", section: "People" },
      { key: "pace", label: "PACe", icon: "GitBranch", href: "/performance/pace", section: "People" },
      { key: "survey", label: "Survey", icon: "BarChart2", href: "/performance/survey", section: "People", defaultDisabled: true },

      /* ─── Cash ─── */
      { key: "cash", label: "Cash", icon: "DollarSign", href: "/cash", section: "Cash", defaultDisabled: true },
    ],
  },
  {
    // QuikInfra — construction ERP. Order + sections mirror the QuikInfra
    // sidebar (CONSTRUCTION_NAV in apps/quikinfra/src/components/QuikInfraShell.tsx).
    // Keep this in sync with that nav so the super-admin toggle tree reads
    // like the menu users already know.
    appSlug: "quikinfra",
    modules: [
      { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },

      /* ─── Admin / Setup ─── */
      { key: "organization", label: "Organization", icon: "Globe", section: "Admin / Setup" },
      { key: "organization.companies", label: "Companies", icon: "Globe", href: "/masters/companies", parentKey: "organization" },
      { key: "organization.departments", label: "Departments", icon: "Building2", href: "/masters/departments", parentKey: "organization" },
      { key: "organization.gst", label: "GST Codes", icon: "Receipt", href: "/masters/gst", parentKey: "organization" },
      { key: "organization.tds", label: "TDS Codes", icon: "CreditCard", href: "/masters/tds", parentKey: "organization" },
      { key: "organization.uom", label: "UOM", icon: "Calculator", href: "/masters/uom", parentKey: "organization" },
      { key: "organization.workCategories", label: "Work Categories", icon: "ListTodo", href: "/masters/work-categories", parentKey: "organization" },
      { key: "organization.terms", label: "Terms & Conditions", icon: "FileText", href: "/masters/terms", parentKey: "organization" },

      /* ─── Master Data ─── */
      { key: "masters", label: "Masters", icon: "Database", section: "Master Data" },
      { key: "masters.customers", label: "Customers", icon: "Building2", href: "/masters/customers", parentKey: "masters" },
      { key: "masters.projects", label: "Projects", icon: "FolderKanban", href: "/masters/projects", parentKey: "masters" },
      { key: "masters.itemGroups", label: "Item Groups", icon: "Boxes", href: "/masters/item-groups", parentKey: "masters" },
      { key: "masters.items", label: "Items / Materials", icon: "Package", href: "/masters/items", parentKey: "masters" },
      { key: "masters.vendors", label: "Vendors", icon: "Truck", href: "/masters/vendors", parentKey: "masters" },
      { key: "masters.contractors", label: "Contractors", icon: "HardHat", href: "/masters/contractors", parentKey: "masters" },
      { key: "masters.locations", label: "Locations / Sites", icon: "MapPin", href: "/masters/locations", parentKey: "masters" },
      { key: "masters.machinery", label: "Machinery", icon: "Hammer", href: "/masters/machinery", parentKey: "masters" },
      { key: "masters.assets", label: "Assets / Tools", icon: "Wrench", href: "/masters/assets", parentKey: "masters" },
      { key: "masters.costCenters", label: "Cost Centers", icon: "BarChart3", href: "/masters/cost-centers", parentKey: "masters" },

      /* ─── Projects ─── */
      { key: "projectMgmt", label: "Project Mgmt", icon: "FolderKanban", section: "Projects" },
      { key: "projectMgmt.boq", label: "BOQ", icon: "FileSpreadsheet", href: "/projects/boq", parentKey: "projectMgmt" },
      { key: "projectMgmt.wbs", label: "WBS & Planning", icon: "ListTree", href: "/projects/wbs", parentKey: "projectMgmt" },
      { key: "projectMgmt.estimation", label: "Material Estimation", icon: "Calculator", href: "/projects/estimation", parentKey: "projectMgmt" },
      { key: "projectMgmt.workOrders", label: "Work Orders", icon: "Hammer", href: "/projects/work-orders", parentKey: "projectMgmt" },
      { key: "projectMgmt.dpr", label: "Daily Progress (DPR)", icon: "CalendarCheck", href: "/projects/dpr", parentKey: "projectMgmt" },
      { key: "projectMgmt.gantt", label: "Gantt View", icon: "GanttChart", href: "/projects/gantt", parentKey: "projectMgmt" },
      { key: "projectMgmt.hindrance", label: "Hindrance Register", icon: "AlertTriangle", href: "/projects/hindrance", parentKey: "projectMgmt" },
      { key: "projectMgmt.documents", label: "Documents", icon: "FileText", href: "/projects/documents", parentKey: "projectMgmt" },

      /* ─── Procurement ─── */
      { key: "purchase", label: "Purchase", icon: "ShoppingCart", section: "Procurement" },
      { key: "purchase.requisitions", label: "Purchase Requisitions", icon: "ClipboardList", href: "/purchase/requisitions", parentKey: "purchase" },
      { key: "purchase.indents", label: "Indents", icon: "FileText", href: "/purchase/indents", parentKey: "purchase" },
      { key: "purchase.rfqs", label: "RFQ", icon: "GitCompareArrows", href: "/purchase/rfqs", parentKey: "purchase" },
      { key: "purchase.quoteAnalysis", label: "Quote Analysis & Shortlist", icon: "ClipboardCheck", href: "/purchase/quote-analysis", parentKey: "purchase" },
      { key: "purchase.orders", label: "Purchase Orders", icon: "FileSpreadsheet", href: "/purchase/orders", parentKey: "purchase" },

      /* ─── Inventory ─── */
      { key: "store", label: "Store", icon: "Warehouse", section: "Inventory" },
      { key: "store.grn", label: "GRN", icon: "BadgeCheck", href: "/store/grn", parentKey: "store" },
      { key: "store.stockRegister", label: "Stock Register", icon: "BarChart3", href: "/store/stock-register", parentKey: "store" },
      { key: "store.issue", label: "Material Issue", icon: "Package", href: "/store/issue", parentKey: "store" },
      { key: "store.gatePass", label: "Gate Pass", icon: "ClipboardList", href: "/store/gate-pass", parentKey: "store" },
      { key: "store.goodReturn", label: "Good Return", icon: "ArrowLeftRight", href: "/store/good-return", parentKey: "store" },
      { key: "store.transfer", label: "Stock Transfer", icon: "ArrowLeftRight", href: "/store/transfer", parentKey: "store" },
      { key: "store.reconciliation", label: "Stock Reconciliation", icon: "FileBarChart2", href: "/store/reconciliation", parentKey: "store" },
      { key: "store.diesel", label: "Diesel Log", icon: "Fuel", href: "/store/diesel-log", parentKey: "store" },
      { key: "store.assetManagement", label: "Asset Management", icon: "Wrench", href: "/store/asset-management", parentKey: "store" },

      /* ─── Quality & Safety ─── */
      { key: "qualitySafety", label: "Quality & Safety", icon: "ShieldCheck", section: "Quality & Safety" },
      { key: "qualitySafety.inspection", label: "Inspection/Checklist", icon: "ClipboardCheck", href: "/quality", parentKey: "qualitySafety" },
      { key: "qualitySafety.incidents", label: "Incidents", icon: "AlertTriangle", href: "/safety/incidents", parentKey: "qualitySafety" },
      { key: "qualitySafety.toolbox", label: "Toolbox Talks", icon: "MessageSquare", href: "/safety/toolbox-talks", parentKey: "qualitySafety" },

      /* ─── Machinery & Equipment ─── */
      { key: "machineryEquipment", label: "Machinery & Equipment", icon: "Hammer", section: "Machinery & Equipment" },
      { key: "machineryEquipment.logBook", label: "Equipment Log Book", icon: "Gauge", href: "/equipment/log-book", parentKey: "machineryEquipment" },
      { key: "machineryEquipment.maintenance", label: "Maintenance", icon: "Wrench", href: "/equipment/maintenance", parentKey: "machineryEquipment" },
      { key: "machineryEquipment.deployment", label: "Deployment & Compliance", icon: "Truck", href: "/equipment/deployment", parentKey: "machineryEquipment" },
      { key: "machineryEquipment.fleet", label: "Fleet Dashboard", icon: "BarChart3", href: "/equipment/fleet", parentKey: "machineryEquipment" },
      { key: "machineryEquipment.hireRent", label: "Hire & Rent", icon: "ArrowLeftRight", href: "/equipment/hire-rent", parentKey: "machineryEquipment" },
      { key: "machineryEquipment.fixedAssets", label: "Fixed Asset / Tools", icon: "Boxes", href: "/equipment/fixed-assets", parentKey: "machineryEquipment" },

      /* ─── Finance ─── */
      { key: "finance", label: "Finance", icon: "CreditCard", section: "Finance" },
      { key: "finance.raBills", label: "RA Bills (Sub-Contractor)", icon: "FileSpreadsheet", href: "/finance/ra-bills", parentKey: "finance" },
      { key: "finance.vendorPayments", label: "Vendor Payments", icon: "CreditCard", href: "/finance/vendor-payments", parentKey: "finance" },
      { key: "finance.clientBilling", label: "Client Billing", icon: "Receipt", href: "/finance/client-billing", parentKey: "finance" },
      { key: "finance.pettyCash", label: "Petty Cash", icon: "Wallet", href: "/finance/petty-cash", parentKey: "finance" },
      { key: "finance.retention", label: "Retention & SD", icon: "ShieldCheck", href: "/finance/retention", parentKey: "finance" },

      /* ─── System ─── */
      { key: "approvals", label: "Approvals", icon: "CheckCircle2", href: "/approvals", section: "System" },
      { key: "reports", label: "Reports", icon: "FileBarChart2", href: "/reports", section: "System" },
      { key: "settings", label: "Settings", icon: "Settings", section: "System" },
      { key: "settings.users", label: "Users", icon: "UserCog", href: "/settings/users", parentKey: "settings" },
      { key: "settings.workflows", label: "Workflows", icon: "Workflow", href: "/settings/workflows", parentKey: "settings" },
    ],
  },
  {
    appSlug: "admin",
    modules: [
      { key: "overview", label: "Overview", icon: "LayoutDashboard", href: "/dashboard" },
      { key: "members", label: "Members", icon: "Users", href: "/members" },
      { key: "teams", label: "Teams", icon: "FolderTree", href: "/teams" },
      { key: "apps", label: "Apps", icon: "AppWindow", href: "/apps" },
      { key: "roles", label: "Roles", icon: "ShieldCheck", href: "/roles" },
      { key: "settings", label: "Settings", icon: "Settings", href: "/settings" },
    ],
  },
  {
    // QuikVC OS — VC firm operating system. See _internal/architecture-notes/quikvc-architecture-v1.md.
    // 3 portals (VC / Founder / Investor) routed by role; modules below are the VC-portal nav.
    appSlug: "quikvc",
    modules: [
      { key: "home",     label: "Home",     icon: "LayoutDashboard", href: "/home" },
      { key: "sourcing", label: "Sourcing", icon: "Compass",         href: "/sourcing" },

      { key: "deals",          label: "Deals",    icon: "Briefcase" },
      { key: "deals.list",     label: "Pipeline", icon: "Kanban",  href: "/deals",       parentKey: "deals" },
      { key: "deals.tasks",    label: "Tasks",    icon: "CheckSquare", href: "/tasks",   parentKey: "deals" },
      { key: "deals.meetings", label: "Meetings", icon: "Calendar", href: "/meetings",   parentKey: "deals" },

      { key: "investors",        label: "Investors", icon: "Users" },
      { key: "investors.list",   label: "Investors", icon: "User",  href: "/investors",  parentKey: "investors" },
      { key: "investors.calls",  label: "Capital Calls", icon: "PhoneCall", href: "/investors/calls", parentKey: "investors" },

      { key: "repayments", label: "Repayments", icon: "Repeat", href: "/repayments" },
      { key: "reports",    label: "Reports",    icon: "BarChart3", href: "/reports" },
      { key: "alerts",     label: "Alerts",     icon: "Bell",   href: "/alerts" },

      { key: "underwriting",                  label: "Underwriting Setup", icon: "Settings" },
      { key: "underwriting.verticals",        label: "Verticals",          icon: "Layers",   href: "/admin/verticals",          parentKey: "underwriting" },
      { key: "underwriting.scoring",          label: "Scoring",            icon: "Target",   href: "/admin/scoring",            parentKey: "underwriting" },
      { key: "underwriting.workflow",         label: "Workflow",           icon: "GitBranch", href: "/admin/workflow",          parentKey: "underwriting" },
      { key: "underwriting.icVoting",         label: "IC Voting",          icon: "Vote",     href: "/admin/ic-voting",          parentKey: "underwriting" },
      { key: "underwriting.termSheet",        label: "Term Sheet Template", icon: "FileText", href: "/admin/term-sheet-template", parentKey: "underwriting" },
    ],
  },
  {
    // QuikChat — team messaging SPA. Flat module list (no sub-modules); the
    // app is a single authed page, so modules toggle affordances/routes rather
    // than sidebar nav entries. `messaging` is the always-on core (never
    // disabled). All default-on (no `defaultDisabled`). Read-only in QuikChat:
    // super admins toggle these; QuikChat only reads the flags (RBAC Phase 3).
    appSlug: "quikchat",
    modules: [
      { key: "messaging", label: "Messaging", icon: "MessageSquare" },
      { key: "calls", label: "Calls", icon: "Phone" },
      { key: "assistant", label: "Assistant", icon: "Sparkles" },
      { key: "calendar", label: "Calendar", icon: "Calendar" },
      { key: "knowledge_base", label: "Knowledge Base", icon: "BookOpen" },
    ],
  },
  {
    // QuikPreSales — MoreYeahs pre-sales portal. Order mirrors the app sidebar.
    appSlug: "quikpresales",
    modules: [
      { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },

      { key: "leads", label: "Leads", icon: "Inbox", href: "/leads", section: "Pipeline" },
      { key: "engagements", label: "Engagements", icon: "Briefcase", href: "/engagements", section: "Pipeline" },
      { key: "rfp", label: "RFP Manager", icon: "FileSearch", href: "/rfps", section: "Pipeline" },
      { key: "proposals", label: "Proposals", icon: "FileText", href: "/proposals", section: "Pipeline" },
      { key: "estimates", label: "Cost Estimator", icon: "Calculator", href: "/estimates", section: "Pipeline" },

      { key: "library", label: "Library", icon: "Library", section: "Library" },
      { key: "library.templates", label: "Templates", icon: "LayoutTemplate", href: "/templates", parentKey: "library" },
      { key: "library.demos", label: "Demo Library", icon: "MonitorPlay", href: "/demos", parentKey: "library" },
      { key: "library.knowledge", label: "Knowledge", icon: "BookOpen", href: "/knowledge", parentKey: "library" },

      { key: "winloss", label: "Win / Loss", icon: "Trophy", href: "/winloss", section: "Insights" },
      { key: "weekly", label: "Weekly Dashboard", icon: "CalendarRange", href: "/weekly", section: "Insights" },
      { key: "team", label: "Team Overview", icon: "Users", href: "/team", section: "Insights" },

      { key: "settings", label: "Settings", icon: "Settings", href: "/settings/roles", section: "Administration" },
    ],
  },
];

/* ─── Utilities ───────────────────────────────────────────────────────── */

/**
 * Returns the dot-path ancestors of a module key, excluding the key itself.
 *
 *   ancestorsOf("kpi.teams")       -> ["kpi"]
 *   ancestorsOf("meetings.weekly") -> ["meetings"]
 *   ancestorsOf("kpi")             -> []
 */
export function ancestorsOf(moduleKey: string): string[] {
  const parts = moduleKey.split(".");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("."));
  }
  return out;
}

/**
 * Cascade rule: a module is enabled iff itself AND every ancestor are enabled.
 *
 *   isModuleEnabled("kpi.teams", new Set())         -> true  (nothing disabled)
 *   isModuleEnabled("kpi.teams", new Set(["kpi"]))  -> false (parent disabled)
 *   isModuleEnabled("kpi.teams", new Set(["kpi.teams"])) -> false
 */
export function isModuleEnabled(moduleKey: string, disabled: Set<string>): boolean {
  if (disabled.has(moduleKey)) return false;
  for (const ancestor of ancestorsOf(moduleKey)) {
    if (disabled.has(ancestor)) return false;
  }
  return true;
}

/** Return the app config for a given slug, or undefined if unknown. */
export function getAppConfig(appSlug: string): AppModuleConfig | undefined {
  return MODULE_REGISTRY.find((a) => a.appSlug === appSlug);
}

/**
 * Keys of modules flagged `defaultDisabled` for an app — off by default for
 * every organization. Returns an empty set for unknown apps.
 */
export function globallyDisabledModules(appSlug: string): Set<string> {
  const app = getAppConfig(appSlug);
  if (!app) return new Set();
  return new Set(app.modules.filter((m) => m.defaultDisabled).map((m) => m.key));
}

/**
 * Effective disabled-module set for a tenant: registry defaults reconciled with
 * the tenant's explicit AppModuleFlag rows. Two storage conventions, by type:
 *
 *  - Normal (default-on) module — disabled iff a row says `enabled: false`.
 *  - `defaultDisabled` (default-off) module — disabled UNLESS a row says
 *    `enabled: true` (an explicit per-tenant override turns it on).
 *
 * Pure + client-safe. Used by both the feature gate (`getDisabledModules`) and
 * the super-admin GET endpoint so the two never diverge.
 */
export function computeDisabledModules(
  appSlug: string,
  rows: ReadonlyArray<{ moduleKey: string; enabled: boolean }>,
): Set<string> {
  const globally = globallyDisabledModules(appSlug);
  const disabled = new Set(globally);
  for (const r of rows) {
    if (globally.has(r.moduleKey)) {
      if (r.enabled) disabled.delete(r.moduleKey); // override turns it on
    } else if (!r.enabled) {
      disabled.add(r.moduleKey);
    }
  }
  return disabled;
}

/**
 * Filter a list of modules to only those that should be visible given the
 * disabled-set. Applies the cascade rule. Preserves order.
 */
export function visibleModules(
  modules: readonly ModuleDef[],
  disabled: Set<string>,
): ModuleDef[] {
  return modules.filter((m) => isModuleEnabled(m.key, disabled));
}

/**
 * Reverse lookup: given a URL path, find the most specific module whose href
 * matches (longest prefix wins). Used by sidebar active-state highlighting
 * AND by the middleware/layout gate (if we ever want path-based gating).
 *
 * Handles trailing slashes and exact matches.
 */
export function findModuleByPath(
  appSlug: string,
  pathname: string,
): ModuleDef | undefined {
  const app = getAppConfig(appSlug);
  if (!app) return undefined;
  let best: ModuleDef | undefined;
  let bestLen = -1;
  for (const m of app.modules) {
    if (!m.href) continue;
    if (pathname === m.href || pathname.startsWith(m.href + "/")) {
      if (m.href.length > bestLen) {
        bestLen = m.href.length;
        best = m;
      }
    }
  }
  return best;
}
