import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Force every route in the auth app to render dynamically.
 *
 * The shared @quikit/ui SignInComponent (and broader UI barrel) pulls in
 * client-only helpers that call `useContext` indirectly. Next 14's static
 * prerender pass still tries to render the React tree to HTML and blows
 * up with `Cannot read properties of null (reading 'useContext')` when no
 * provider is in scope — which fails the build's export step.
 *
 * The auth app is 100% per-request anyway (URL params, session cookies,
 * OAuth state). No page benefits from static prerender; this removes the
 * prerender step entirely.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — QuikIT",
  description: "Sign in, sign up, and manage your QuikIT account.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
