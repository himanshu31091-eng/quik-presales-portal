import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import { SentryInit } from "./sentry-init";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuikIT — Platform Gateway",
  description: "Login, manage your organization, and launch apps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans antialiased min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <SentryInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
