import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.quikit.ai";
export const SITE_NAME = "Quikit";
export const SITE_DESCRIPTION =
  "Quikit is the AI-powered Business OS for modern teams. One platform to run your CRM, projects, marketing, infra, and analytics — without the tool sprawl.";

type PageSeo = {
  title: string;
  description: string;
  keywords?: string[];
  path: string;
  ogImage?: string;
};

// NOTE: titles below DO NOT include "| Quikit" suffix — that's appended once
// by the layout's title.template. Avoid duplicating the brand suffix here.
export const PAGE_SEO: Record<string, PageSeo> = {
  index: {
    // [SEO-AUDIT] Improved title for keyword coverage: all-in-one + CRM + projects + goals
    title: "Quikit — All-in-One Business Platform: CRM, Projects & Goals",
    // [SEO-AUDIT] CTA-led description with free-tier hook
    description:
      "Quikit is the AI-powered business OS that connects your CRM, project tracking, goals, and team in one place. Free for up to 5 users. No credit card required.",
    keywords: [
      "all-in-one business software",
      "business operating system",
      "CRM project management",
      "small business platform",
      "AI business tools",
      "Quikit",
    ],
    path: "/",
  },
  products: {
    title: "All Products — Integrated Business Software Suite",
    description:
      "Explore all Quikit apps: CRM, project tracking, goal setting, infrastructure, social media, and more — all on one connected platform.",
    keywords: [
      "business software suite",
      "integrated business apps",
      "CRM project management HR",
      "small business tools",
      "QuikCRM",
      "QuikTrack",
    ],
    path: "/products",
  },
  contact: {
    // [SEO-AUDIT] Includes "Book a Demo" — high-intent search term
    title: "Contact Quikit — Book a Demo or Get in Touch",
    description:
      "Book a demo, ask a question, or get in touch with the Quikit team. We respond within 24 hours.",
    keywords: ["contact Quikit", "book a demo", "Quikit support", "sales inquiry"],
    path: "/contact",
  },
  platform: {
    // [SEO-AUDIT] Leads with the value prop "one data layer"
    title: "The Quikit Platform — One Data Layer for Every App",
    description:
      "Every Quikit app shares one data layer, one auth system, and one automation engine — so your business runs as a single connected system.",
    keywords: [
      "business platform",
      "connected business apps",
      "single sign-on business software",
      "business automation platform",
      "Quikit platform",
    ],
    path: "/platform",
  },
  pricing: {
    title: "Pricing — Simple, Transparent Plans",
    description:
      "Choose the Quikit plan that fits your team. Transparent pricing with no per-app surcharges — every feature, one price.",
    keywords: ["Quikit pricing", "SaaS pricing", "business software cost"],
    path: "/pricing",
  },
  blog: {
    title: "Blog — Insights from the Quikit Team",
    description:
      "Articles, product updates, and playbooks from the Quikit team on building and running modern businesses with an AI-powered OS.",
    keywords: ["Quikit blog", "business insights", "AI", "SaaS"],
    path: "/blog",
  },
  "blog-post": {
    title: "Quikit Blog Post",
    description:
      "Read the latest article from the Quikit team on running modern businesses with an AI-powered Business OS.",
    keywords: ["Quikit blog", "business insights"],
    path: "/blog",
  },
  quikcrm: {
    title: "QuikCRM — Simple CRM Software for Small Business Teams",
    // [SEO-AUDIT] Added "AI-powered" + "Free to start" hooks
    description:
      "Manage leads, track deals, and automate follow-ups with QuikCRM. AI-powered pipeline management built for small business teams. Free to start.",
    keywords: [
      "simple CRM software small business",
      "CRM for small teams",
      "AI CRM",
      "pipeline management",
      "deal tracking",
      "QuikCRM",
    ],
    path: "/quikcrm",
  },
  quiktrack: {
    title: "QuikTrack — Project Management Software for Teams",
    // [SEO-AUDIT] Emphasises CRM-integration angle (unique selling point)
    description:
      "Run projects with full visibility into timelines, tasks, and ownership. QuikTrack connects directly to your CRM so sales and delivery stay aligned.",
    keywords: [
      "project management software",
      "task tracking",
      "team project tool",
      "project management CRM integration",
      "QuikTrack",
    ],
    path: "/quiktrack",
  },
  quikscale: {
    title: "QuikScale — OKR & Goal Tracking Software for Teams",
    description:
      "Set company goals, track KPIs, and keep your team aligned with QuikScale. Goal tracking that lives where work actually happens.",
    keywords: [
      "OKR software",
      "goal tracking software",
      "KPI tracking",
      "team goal alignment",
      "business goal management",
      "QuikScale",
    ],
    path: "/quikscale",
  },
  quiksocial: {
    title: "QuikSocial — AI Social Media Scheduling & Management",
    description:
      "Plan, write, and publish social content across every channel with AI-powered scheduling. Multi-channel social media management inside your business platform.",
    keywords: [
      "social media scheduling tool",
      "AI social media management",
      "multi-channel social media",
      "social media planner",
      "QuikSocial",
    ],
    path: "/quiksocial",
  },
  quikinfra: {
    title: "QuikInfra — Infrastructure & Field Operations Management",
    description:
      "Manage construction projects, site operations, and field teams from one connected dashboard. Deployments, environments, and uptime — unified.",
    keywords: [
      "construction project management software",
      "field operations management",
      "infrastructure management tool",
      "QuikInfra",
    ],
    path: "/quikinfra",
  },
};

export function buildMetadata(slug: string): Metadata {
  const seo = PAGE_SEO[slug] ?? {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
  };
  const url = `${SITE_URL}${seo.path}`;
  const ogImage = seo.ogImage ?? `${SITE_URL}/assets/Hero%20BG.webp`;

  return {
    metadataBase: new URL(SITE_URL),
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: seo.title,
      description: seo.description,
      url,
      images: [{ url: ogImage, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}
