import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "QuikPreSales — AI-assisted pre-sales",
  description:
    "RFP compliance matrices with citations, AI-drafted proposals, a reusable demo and knowledge library, and a weekly executive scorecard.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="ps-landing">{children}</div>;
}
