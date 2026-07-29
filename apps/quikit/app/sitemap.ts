import type { MetadataRoute } from "next";
import { PAGE_SEO, SITE_URL } from "./(marketing)/_lib/seo";

const SITEMAP_HINTS: Record<
  string,
  {
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }
> = {
  "/": { priority: 1.0, changeFrequency: "weekly" },
  "/products": { priority: 0.9, changeFrequency: "weekly" },
  "/pricing": { priority: 0.95, changeFrequency: "weekly" },
  "/quikcrm": { priority: 0.85, changeFrequency: "monthly" },
  "/quiktrack": { priority: 0.85, changeFrequency: "monthly" },
  "/quikscale": { priority: 0.8, changeFrequency: "monthly" },
  "/quiksocial": { priority: 0.8, changeFrequency: "monthly" },
  "/quikinfra": { priority: 0.8, changeFrequency: "monthly" },
  "/platform": { priority: 0.75, changeFrequency: "monthly" },
  "/blog": { priority: 0.7, changeFrequency: "daily" },
  "/contact": { priority: 0.6, changeFrequency: "monthly" },
};

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const seo of Object.values(PAGE_SEO)) {
    if (seen.has(seo.path)) continue;
    seen.add(seo.path);
    const hint = SITEMAP_HINTS[seo.path] ?? {
      priority: 0.7,
      changeFrequency: "monthly" as const,
    };
    entries.push({
      url: `${SITE_URL}${seo.path}`,
      lastModified: now,
      changeFrequency: hint.changeFrequency,
      priority: hint.priority,
    });
  }
  return entries;
}
