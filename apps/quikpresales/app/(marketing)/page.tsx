import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import { Nav } from "./_components/Nav";

// Session is read per request to send signed-in users straight into the app.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    no: "01",
    title: "RFP compliance matrix",
    body: "Upload an RFP and Claude extracts every discrete requirement, each citing the exact source page and quoted text. Review, respond, and track coverage as a single matrix.",
  },
  {
    no: "02",
    title: "AI proposal drafting",
    body: "Draft sections from the RFP, your templates and your knowledge base. Every edit forks an immutable version, so what you sent a customer stays exactly as it was.",
  },
  {
    no: "03",
    title: "Approval workflow",
    body: "Draft → internal review → customer review → approved. Sign-off needs a distinct permission, so an engineer can build the proposal but only an architect approves it.",
  },
  {
    no: "04",
    title: "Reusable asset library",
    body: "Templates, demos indexed by industry × technology with satisfaction scores, and searchable case studies, battle cards and security docs.",
  },
  {
    no: "05",
    title: "Cost estimator",
    body: "Line-item estimates in whole paise — no float drift — exported to Excel with live SUM formulas the recipient can adjust.",
  },
  {
    no: "06",
    title: "Weekly executive scorecard",
    body: "Proposal turnaround against the 24-hour target, AI adoption, pipeline by stage, demo scores and win/loss — as a RAG board, from live data.",
  },
];

const FLOW = [
  "Sales raises an engagement",
  "RFP uploaded to the engagement",
  "AI extracts requirements with citations",
  "Team responds on the compliance matrix",
  "AI drafts the proposal from templates",
  "Architect approves, export PDF or Word",
];

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access must still see the landing plus
  // the popup — redirecting them to /dashboard would loop them straight back.
  // Mirrors quiksupport / quiktrack / quikscale.
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) redirect("/dashboard");

  return (
    <main>
      <AppAccessDeniedPopup appName="QuikPreSales" />
      <Nav />

      <section className="ps-hero">
        <span className="ps-eyebrow">QuikIT · Pre-Sales</span>
        <h1 className="ps-hero-title">
          Win more, without
          <br />
          rebuilding every <em>proposal</em>.
        </h1>
        <p className="ps-hero-sub">
          QuikPreSales turns an RFP into a cited compliance matrix, drafts the proposal
          from your own templates and case studies, and routes it through approval — so
          responses ship in hours instead of days, and never depend on one person.
        </p>
        <div className="ps-hero-cta">
          <a className="ps-btn ps-btn-primary ps-btn-lg" href="/dashboard">
            Open QuikPreSales
          </a>
          <a className="ps-btn ps-btn-ghost ps-btn-lg" href="#how">
            See how it works
          </a>
        </div>
      </section>

      <section className="ps-section">
        <h2 className="ps-section-title">Everything the pre-sales function needs</h2>
        <p className="ps-section-sub">
          One place for engagements, RFPs, proposals, demos and the numbers leadership asks for.
        </p>
        <div className="ps-grid">
          {FEATURES.map((f) => (
            <article key={f.no} className="ps-card">
              <span className="ps-card-no">Module {f.no}</span>
              <h3 className="ps-card-title">{f.title}</h3>
              <p className="ps-card-body">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ps-section" id="how">
        <h2 className="ps-section-title">From RFP to signed-off proposal</h2>
        <p className="ps-section-sub">
          Every step is recorded on the engagement timeline, with an audit row written in the
          same transaction as the change.
        </p>
        <div className="ps-flow">
          {FLOW.map((step) => (
            <div key={step} className="ps-flow-step">
              {step}
            </div>
          ))}
        </div>
      </section>

      <footer className="ps-footer">
        QuikPreSales — part of the QuikIT platform. One sign-in across every app.
      </footer>
    </main>
  );
}
