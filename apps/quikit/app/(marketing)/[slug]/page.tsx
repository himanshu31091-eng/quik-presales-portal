import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPage } from "../_components/static-page";
import { loadPage, MARKETING_SLUGS } from "../_lib/load-page";
import { buildMetadata } from "../_lib/seo";

export const revalidate = 60;

// Pre-render only the known marketing slugs. Combined with the whitelist
// guard below, the [slug] route can never shadow a launcher route — any
// non-marketing path falls through to notFound() (and defined launcher
// routes / route groups take precedence over this dynamic segment anyway).
export function generateStaticParams() {
  return MARKETING_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

type PageProps = { params: { slug: string } };

export function generateMetadata({ params }: PageProps): Metadata {
  return buildMetadata(params.slug);
}

export default async function MarketingSlugPage({ params }: PageProps) {
  if (!(MARKETING_SLUGS as readonly string[]).includes(params.slug)) {
    notFound();
  }
  const page = await loadPage(params.slug);
  if (!page) notFound();
  return <StaticPage page={page} />;
}
