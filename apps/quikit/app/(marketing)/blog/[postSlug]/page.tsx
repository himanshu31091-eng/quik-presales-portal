import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPage } from "../../_components/static-page";
import { StaticShell } from "../../_components/static-shell";
import { loadLocalPage } from "../../_lib/load-page";
import {
  escapeHtml,
  estimateReadTime,
  fetchBlogPostBySlug,
  fetchBlogPosts,
  formatPostDate,
  type BlogPostRecord,
} from "../../_lib/blog";

export const revalidate = 60;

type PageProps = { params: { postSlug: string } };

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function replaceFirst(source: string, pattern: RegExp, replacement: string) {
  return source.replace(pattern, replacement);
}

function buildRelatedPostsHtml(
  currentSlug: string,
  relatedPosts: BlogPostRecord[],
) {
  const gradients = [
    "grad-purple",
    "grad-coral",
    "grad-green",
    "grad-blue",
    "grad-slate",
    "grad-tan",
  ];
  return relatedPosts
    .filter((post) => post.slug !== currentSlug)
    .slice(0, 3)
    .map((post, index) => {
      const gradientClass = gradients[index % gradients.length];
      const mediaMarkup = post.featuredImage
        ? `<img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.title)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<div class="blog-card-img-inner">${escapeHtml(post.category.slice(0, 1).toUpperCase())}</div>`;
      return `
        <a href="/blog/${post.slug}" class="blog-card">
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
              <span class="blog-card-read-time">${estimateReadTime(post.contentHtml)} min read</span>
            </div>
          </div>
        </a>
      `;
    })
    .join("");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const post = await fetchBlogPostBySlug(params.postSlug);
  return { title: post ? `${post.title} | Quikit Blog` : "Quikit Blog" };
}

export default async function BlogPostPage({ params }: PageProps) {
  const template = loadLocalPage("blog-post");
  if (!template) notFound();

  const post = await fetchBlogPostBySlug(params.postSlug);
  if (!post) return <StaticPage page={template} />;

  const relatedPosts = await fetchBlogPosts(6);
  const readTime = estimateReadTime(post.contentHtml);
  const publishDate = formatPostDate(post.publishedAt);
  const initials = getInitials(post.authorName) || "Q";
  const bannerMarkup = post.featuredImage
    ? `<img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.title)}" style="width:100%;height:100%;object-fit:cover;" />`
    : escapeHtml(post.category.slice(0, 1).toUpperCase());

  let bodyHtml = template.bodyHtml;
  bodyHtml = replaceFirst(
    bodyHtml,
    /<span class="post-cat-pill">[\s\S]*?<\/span>/,
    `<span class="post-cat-pill">${escapeHtml(post.category)}</span>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<h1>[\s\S]*?<\/h1>/,
    `<h1>${escapeHtml(post.title)}</h1>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-avatar">[\s\S]*?<\/div>/,
    `<div class="post-avatar">${escapeHtml(initials)}</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-author-name">[\s\S]*?<\/div>/,
    `<div class="post-author-name">${escapeHtml(post.authorName)}</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-author-role">[\s\S]*?<\/div>/,
    `<div class="post-author-role">${escapeHtml(post.category)} writer</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-meta-item"><strong>Published:<\/strong>[\s\S]*?<\/div>/,
    `<div class="post-meta-item"><strong>Published:</strong> ${escapeHtml(publishDate)}</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-meta-item"><strong>Read time:<\/strong>[\s\S]*?<\/div>/,
    `<div class="post-meta-item"><strong>Read time:</strong> ${readTime} min read</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-banner">[\s\S]*?<\/div>/,
    `<div class="post-banner">${bannerMarkup}</div>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<p class="post-lead">[\s\S]*?<\/p>/,
    `<p class="post-lead">${escapeHtml(post.excerpt)}</p>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="post-body">[\s\S]*?<\/div>\s*<\/article>/,
    `<div class="post-body">${post.contentHtml || ""}</div></article>`,
  );
  bodyHtml = replaceFirst(
    bodyHtml,
    /<div class="related-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
    `<div class="related-grid">${buildRelatedPostsHtml(post.slug, relatedPosts)}</div></div></section>`,
  );

  return (
    <StaticShell styleText={template.styleText} scripts={template.scripts}>
      <main dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </StaticShell>
  );
}
