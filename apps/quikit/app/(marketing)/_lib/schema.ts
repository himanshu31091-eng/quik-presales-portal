import { SITE_URL } from "./seo";

type JsonLd = Record<string, unknown>;

const appPages: Record<
  string,
  { name: string; description: string; path: string }
> = {
  quikcrm: {
    name: "QuikCRM",
    description:
      "Simple CRM software for small businesses to manage leads, contacts, deals and customer pipelines.",
    path: "/quikcrm",
  },
  quiktrack: {
    name: "QuikTrack",
    description:
      "Project task and time tracking software to plan work, track effort, and ship on time.",
    path: "/quiktrack",
  },
  quikscale: {
    name: "QuikScale",
    description:
      "OKR and KPI tracking software for setting company goals and measuring outcomes.",
    path: "/quikscale",
  },
  quiksocial: {
    name: "QuikSocial",
    description:
      "AI-powered social media management software for scheduling, publishing and analytics.",
    path: "/quiksocial",
  },
  quikinfra: {
    name: "QuikInfra",
    description:
      "ERP software built for construction companies to manage projects, costs and resources.",
    path: "/quikinfra",
  },
};

function softwareApp(slug: string): JsonLd {
  const app = appPages[slug];
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.name,
    url: `${SITE_URL}${app.path}`,
    description: app.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    isPartOf: {
      "@type": "SoftwareApplication",
      name: "Quikit",
      url: SITE_URL,
    },
  };
}

function homepageSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Quikit",
    url: SITE_URL,
    description:
      "All in one business management software that connects CRM, projects, goals, and team communication in one platform.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

function productsListSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Quikit Apps",
    description: "All business apps available on the Quikit platform",
    url: `${SITE_URL}/products`,
    itemListElement: Object.entries(appPages).map(([, app], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: app.name,
      url: `${SITE_URL}${app.path}`,
    })),
  };
}

export function getPageSchemas(slug: string): JsonLd[] {
  if (slug === "index") return [homepageSchema()];
  if (slug === "products") return [productsListSchema()];
  if (slug in appPages) return [softwareApp(slug)];
  return [];
}
