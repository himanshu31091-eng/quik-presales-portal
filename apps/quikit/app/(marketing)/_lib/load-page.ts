/**
 * Marketing content loader — JSON static map. The standalone app read
 * from disk + an optional Prisma CMS; in-monorepo we statically import
 * the curated `_data/*.json` so it's bundled correctly on Vercel
 * serverless (no fs/cwd fragility, no second ORM).
 */
import type { StaticPageData } from "../_components/static-page";
import index from "../_data/index.json";
import platform from "../_data/platform.json";
import products from "../_data/products.json";
import pricing from "../_data/pricing.json";
import contact from "../_data/contact.json";
import quikcrm from "../_data/quikcrm.json";
import quikinfra from "../_data/quikinfra.json";
import quikscale from "../_data/quikscale.json";
import quiksocial from "../_data/quiksocial.json";
import quiktrack from "../_data/quiktrack.json";
import blog from "../_data/blog.json";
import blogPost from "../_data/blog-post.json";

const MAP: Record<string, unknown> = {
  index,
  platform,
  products,
  pricing,
  contact,
  quikcrm,
  quikinfra,
  quikscale,
  quiksocial,
  quiktrack,
  blog,
  "blog-post": blogPost,
};

/** Slugs reachable at `/<slug>` (excludes index/blog/blog-post which have
 *  their own routes). The marketing `[slug]` route whitelists this set so
 *  it can never shadow a launcher route. */
export const MARKETING_SLUGS = [
  "platform",
  "products",
  "pricing",
  "contact",
  "quikcrm",
  "quikinfra",
  "quikscale",
  "quiksocial",
  "quiktrack",
] as const;

export function loadLocalPage(slug: string): StaticPageData | null {
  return (MAP[slug] as StaticPageData | undefined) ?? null;
}

export async function loadPage(slug: string): Promise<StaticPageData | null> {
  return loadLocalPage(slug);
}
