/**
 * Per-app content for the launcher's app-detail screen (opened by the eye
 * button). Keyed by app slug — mirrors the marketing site's `VD["<slug>-overview"]`
 * map so each app shows its own title, overview, features, stats, and screenshot.
 *
 * Overview text + accent colors + ratings are lifted from the marketing
 * `apps.json` detail pages; feature lists are authored per app's domain.
 * Apps with no entry fall back to the live DB description + a gradient
 * placeholder in the modal.
 */
export interface AppDetail {
  /** Per-app theme color (accent underline on the active tab + screenshot frame). */
  accent: string;
  tagline: string;
  overview: string;
  features: string[];
  stats: { rating: string; language: string; category: string; updated: string };
  /** Public paths under /app-details. Empty → modal shows a gradient placeholder. */
  screenshots: string[];
}

export const APP_DETAILS: Record<string, AppDetail> = {
  quikcrm: {
    accent: "#2F5BD0",
    tagline: "Sales execution OS for your whole pipeline.",
    overview:
      "QuikCRM is a dedicated sales platform with everything you need to manage any pipeline. Working side by side with the rest of QuikIT, your sales team stays connected to the whole organization while running a powerful CRM.",
    features: [
      "Visual pipeline for every sales stage",
      "Lead, contact & account management",
      "Quotes, orders & invoicing",
      "Calls, tasks & activity timeline",
      "Reports & sales dashboards",
    ],
    stats: { rating: "4.8", language: "EN", category: "Sales", updated: "2w ago" },
    screenshots: ["/app-details/quikcrm.webp"],
  },
  quiktrack: {
    accent: "#1E66E0",
    tagline: "Plan projects and track work end to end.",
    overview:
      "QuikTrack brings your projects, tasks, and teams into one place so everyone knows what to do next. Plan work, assign owners, and track progress from kickoff to delivery — all in one connected workspace.",
    features: [
      "Projects, tasks & sprints",
      "Assign owners & track progress",
      "Kanban boards & timelines",
      "Custom fields & workflows",
      "Notifications & watchers",
    ],
    stats: { rating: "4.7", language: "EN", category: "Project Management", updated: "1w ago" },
    screenshots: ["/app-details/quiktrack.webp"],
  },
  quikscale: {
    accent: "#19944A",
    tagline: "Connect company goals to the work that drives them.",
    overview:
      "QuikScale connects company goals to the work that drives them. Set objectives, track KPIs, and keep every team aligned on what matters most — so growth never loses focus.",
    features: [
      "Company goals & OKRs",
      "KPI tracking with weekly values",
      "Priorities & WWW execution",
      "OPSP planning",
      "Team & individual dashboards",
    ],
    stats: { rating: "4.6", language: "EN", category: "Strategy", updated: "3w ago" },
    screenshots: ["/app-details/quikscale.webp"],
  },
  quiksocial: {
    accent: "#E94F8A",
    tagline: "Plan, create, and publish across every channel.",
    overview:
      "QuikSocial helps you plan, create, and publish content across every channel. Schedule posts, collaborate on campaigns, and measure what works — all in one place.",
    features: [
      "Multi-channel post scheduling",
      "Campaign collaboration",
      "Content calendar & approvals",
      "Auto-replies & social inbox",
      "Performance analytics",
    ],
    stats: { rating: "4.7", language: "EN", category: "Marketing", updated: "5d ago" },
    screenshots: ["/app-details/quiksocial.webp"],
  },
  quikinfra: {
    accent: "#E8821E",
    tagline: "Run construction and field operations end to end.",
    overview:
      "QuikInfra runs your construction and field operations end to end. Manage projects, coordinate field teams, and keep every site on schedule and on budget.",
    features: [
      "Projects, BOQ & DPR",
      "Purchase, store & inventory",
      "Finance & billing",
      "Safety & quality checks",
      "Field team coordination",
    ],
    stats: { rating: "4.8", language: "EN", category: "Construction", updated: "1d ago" },
    screenshots: ["/app-details/quikinfra.webp"],
  },
  quikhrms: {
    accent: "#0EA5E9",
    tagline: "Hiring, payroll, and people ops in one system.",
    overview:
      "QuikHRMS runs your entire people operation — hiring, onboarding, payroll, and attendance on one platform, connected to the rest of your QuikIT workspace.",
    features: [
      "Hiring & onboarding",
      "Payroll & payslips",
      "Attendance & leave",
      "Performance reviews",
      "Employee self-service",
    ],
    stats: { rating: "4.6", language: "EN", category: "HR", updated: "Recently" },
    screenshots: [],
  },
  quikvc: {
    accent: "#7C3AED",
    tagline: "An AI-powered VC operating system.",
    overview:
      "QuikVC is an AI-powered VC operating system — sourcing, deal flow, IC memos, allocations, and repayments in one connected workspace built for investment teams.",
    features: [
      "Deal sourcing & pipeline",
      "IC memos & voting",
      "Allocations & commitments",
      "Capital calls & repayments",
      "Portfolio analytics",
    ],
    stats: { rating: "4.7", language: "EN", category: "Finance", updated: "Recently" },
    screenshots: [],
  },
  quiklms: {
    accent: "#0D9488",
    tagline: "Build, deliver, and track learning in one place.",
    overview:
      "QuikSkill LMS is your learning management system — author courses, run cohorts, and track every learner's progress. Deliver lessons, quizzes, and certificates while your team stays connected to the rest of your QuikIT workspace.",
    features: [
      "Course & lesson authoring",
      "Quizzes & assessments",
      "Cohorts & enrollments",
      "Progress tracking & certificates",
      "Learner dashboards & reports",
    ],
    stats: { rating: "—", language: "EN", category: "Learning", updated: "Recently" },
    screenshots: [],
  },
  admin: {
    accent: "#6B7280",
    tagline: "Administer your organization across every app.",
    overview:
      "The Admin Portal is where you run your organization — manage users and teams, control which apps each member can access, and handle billing and org settings, all in one place.",
    features: [
      "User & member management",
      "Team setup",
      "App access control",
      "Billing & plans",
      "Organization settings",
    ],
    stats: { rating: "—", language: "EN", category: "Administration", updated: "Recently" },
    screenshots: [],
  },
};
