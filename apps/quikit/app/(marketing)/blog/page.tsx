import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPage } from "../_components/static-page";
import { StaticShell } from "../_components/static-shell";
import { loadLocalPage } from "../_lib/load-page";
import {
  escapeHtml,
  fetchBlogPosts,
  formatPostDate,
  type BlogPostRecord,
} from "../_lib/blog";
import { buildMetadata } from "../_lib/seo";

export const revalidate = 60;
export const metadata: Metadata = buildMetadata("blog");

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function buildBlogCardsHtml() {
  const posts = await fetchBlogPosts(18);
  if (!posts.length) return "";
  const gradients = [
    "grad-tan",
    "grad-blue",
    "grad-green",
    "grad-purple",
    "grad-coral",
    "grad-slate",
  ];
  return posts
    .map((post: BlogPostRecord, index: number) => {
      const cardUrl = `/blog/${post.slug}`;
      const categorySlug = post.category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const gradientClass = gradients[index % gradients.length];
      const mediaMarkup = post.featuredImage
        ? `<img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.title)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div class="blog-card-img-inner">${escapeHtml(post.category.slice(0, 1).toUpperCase())}</div>`;
      return `
        <a href="${cardUrl}" class="blog-card" data-category="${escapeHtml(categorySlug)}" data-title="${escapeHtml(post.title)}" data-url="${cardUrl}">
          <div class="blog-card-img ${post.featuredImage ? "" : gradientClass}">
            ${mediaMarkup}
            <span class="blog-card-cat">${escapeHtml(post.category)}</span>
          </div>
          <div class="blog-card-body">
            <h3 class="blog-card-title">${escapeHtml(post.title)}</h3>
            <p class="blog-card-excerpt">${escapeHtml(post.excerpt || "Read the full article from the Quikit team.")}</p>
            <div class="blog-card-footer">
              <div class="blog-card-author">
                <div class="blog-card-avatar" style="background:#0D1117;">${escapeHtml(getInitials(post.authorName) || "Q")}</div>
                <span class="blog-card-author-name">${escapeHtml(post.authorName)}</span>
              </div>
              <span class="blog-card-read-time">${escapeHtml(formatPostDate(post.publishedAt))}</span>
            </div>
          </div>
        </a>
      `;
    })
    .join("");
}

export default async function BlogPage() {
  const template = loadLocalPage("blog");
  if (!template) notFound();

  const cardsHtml = await buildBlogCardsHtml();
  if (!cardsHtml) return <StaticPage page={template} />;

  const bodyHtml = template.bodyHtml.replace(
    /<div id="blog-grid" class="blog-grid">[\s\S]*?<\/div>\s*<div id="blog-no-results"/,
    `<div id="blog-grid" class="blog-grid">${cardsHtml}</div><div id="blog-no-results"`,
  );

  return (
    <StaticShell
      styleText={template.styleText}
      scripts={template.scripts}
      scriptOverrides={[
        (script) =>
          script.replace(
            "location.href = '/blog-post';",
            "var url = card.getAttribute('data-url'); if (url) { location.href = url; }",
          ),
      ]}
    >
      <main dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </StaticShell>
  );
}
