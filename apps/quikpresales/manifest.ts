/**
 * App manifest — required for every QuikIT app.
 *
 * The launcher (apps/quikit) reads each app's manifest at build time to
 * generate its app grid + permissions list. Keep this file static (no
 * runtime work). The integration owner verifies the manifest during
 * integration; do not edit fields after the integration owner has
 * signed off (rename/delete the app instead).
 */
export interface AppManifest {
  /** Stable kebab-case id. Used in URLs, audit logs, feature flags. */
  appId: string;
  /** Human-readable name shown in the launcher grid. */
  name: string;
  /** One-line description shown on hover in the launcher. */
  description: string;
  /** Route prefix this app owns at the platform level (e.g. "/social"). */
  routePrefix: string;
  /** Lucide icon name used in the launcher tile. */
  icon: string;
  /**
   * Permissions this app reads/writes — must match `Permission` enum in
   * @quikit/shared. Devs MUST NOT invent new permission strings; coordinate
   * with the integration owner first.
   */
  permissions: string[];
  /**
   * Top-level navigation entries surfaced in the app sidebar. Order matters.
   * Each entry corresponds to a route under `routePrefix`.
   */
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quikpresales",
  name: "QuikPreSales",
  description: "AI-assisted pre-sales: RFPs, proposals, demos and win/loss analysis",
  routePrefix: "/presales",
  icon: "Presentation",
  permissions: [],
  navigation: [
    { label: "Dashboard", href: "/presales/dashboard", icon: "LayoutDashboard" },
    { label: "Engagements", href: "/presales/engagements", icon: "Briefcase" },
    { label: "RFP Manager", href: "/presales/rfps", icon: "FileSearch" },
    { label: "Proposals", href: "/presales/proposals", icon: "FileText" },
    { label: "Templates", href: "/presales/templates", icon: "LayoutTemplate" },
    { label: "Demo Library", href: "/presales/demos", icon: "MonitorPlay" },
    { label: "Knowledge", href: "/presales/knowledge", icon: "BookOpen" },
    { label: "Cost Estimator", href: "/presales/estimates", icon: "Calculator" },
    { label: "Win / Loss", href: "/presales/winloss", icon: "Trophy" },
    { label: "Weekly Dashboard", href: "/presales/weekly", icon: "CalendarRange" },
    { label: "Settings", href: "/presales/settings", icon: "Settings" },
  ],
};

export default manifest;
