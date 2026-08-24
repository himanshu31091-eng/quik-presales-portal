import type { Metadata } from "next";

/**
 * Title-only layout. `rfps/page.tsx` is a client component and so cannot
 * export metadata itself; this gives the route a distinct document title
 * (WCAG 2.4.2) without changing what renders.
 */
export const metadata: Metadata = { title: "RFP Manager" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
