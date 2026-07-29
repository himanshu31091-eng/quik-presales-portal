/**
 * Blog data — JSON-only. The standalone marketing app had an optional
 * Prisma-6 CMS; in-monorepo we ship the curated fallback set as the
 * source of truth (no second ORM). Authored-blog via @quikit/database
 * is a future follow-up if needed.
 */
export type BlogPostRecord = {
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  category: string;
  authorName: string;
  featuredImage: string;
  publishedAt: string;
};

const posts: BlogPostRecord[] = [
  {
    slug: "future-of-crm-automation",
    title: "The Future of CRM Automation for Lean Teams",
    excerpt:
      "A practical look at how smaller teams can automate repetitive customer workflows without adding more tools or more overhead.",
    contentHtml:
      "<p>Lean teams get the most value when their CRM removes repeated work and keeps customer context easy to follow.</p><p>Start with intake, handoffs, and follow-up workflows before you automate everything else.</p>",
    category: "Automation",
    authorName: "Quikit Team",
    featuredImage: "/assets/blog-grid-1.jpg",
    publishedAt: "2026-01-15T09:00:00.000Z",
  },
  {
    slug: "building-an-ops-stack-that-scales",
    title: "Building an Ops Stack That Scales Without the Mess",
    excerpt:
      "How growing companies can keep operations simple, connected, and resilient as more teams and workflows come online.",
    contentHtml:
      "<p>Scalable operations come from shared data, visible ownership, and fewer duplicate tools.</p><p>A single operating layer keeps the team faster as the business grows.</p>",
    category: "Operations",
    authorName: "Quikit Team",
    featuredImage: "/assets/blog-grid-2.jpg",
    publishedAt: "2026-02-05T09:00:00.000Z",
  },
  {
    slug: "why-product-and-support-need-shared-data",
    title: "Why Product and Support Need Shared Data",
    excerpt:
      "Shared context helps product and support teams move faster, resolve issues sooner, and learn from customers in real time.",
    contentHtml:
      "<p>When support insights are shared directly with product teams, fixes happen faster and roadmap decisions improve.</p><p>Connected systems turn customer feedback into action instead of backlog noise.</p>",
    category: "Product",
    authorName: "Quikit Team",
    featuredImage: "/assets/blog-grid-3.jpg",
    publishedAt: "2026-03-02T09:00:00.000Z",
  },
];

export function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function estimateReadTime(content: string) {
  const words = stripHtml(content).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function formatPostDate(dateValue?: string) {
  if (!dateValue) return "Recently updated";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export async function fetchBlogPosts(limit = 12): Promise<BlogPostRecord[]> {
  return posts.slice(0, limit);
}

export async function fetchBlogPostBySlug(
  slug: string,
): Promise<BlogPostRecord | null> {
  return posts.find((p) => p.slug === slug) ?? null;
}
