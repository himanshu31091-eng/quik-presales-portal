import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  // Template so each route can set just its own name and still get a distinct,
  // meaningful document title (WCAG 2.4.2). Dashboard pages are client
  // components and cannot export metadata themselves, so each supplies it from
  // a sibling layout.tsx.
  title: {
    default: "QuikPreSales",
    template: "%s · QuikPreSales",
  },
  description: "AI-assisted pre-sales: RFPs, proposals, demos and win/loss analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
