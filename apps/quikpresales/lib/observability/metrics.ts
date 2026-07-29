import { db } from "@/lib/db";

/**
 * Prometheus exposition for QuikPreSales.
 *
 * Deliberately a point-in-time gauge snapshot rather than a live counter
 * registry: this app runs on Vercel serverless, where in-process counters die
 * with the invocation and would report near-zero on every scrape. Gauges read
 * from Postgres are accurate regardless of which instance answers.
 *
 * Per-request latency/error counters are already captured centrally by
 * `logApiCall` (see lib/api/withOrgAuth.ts) into `quikit.ApiCall`, so they are
 * not duplicated here.
 */

export function getContentType(): string {
  return "text/plain; version=0.0.4; charset=utf-8";
}

/** Escape a Prometheus label value. */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

interface Gauge {
  name: string;
  help: string;
  /** [labels, value] pairs; empty labels object renders an unlabelled sample. */
  samples: Array<{ labels?: Record<string, string>; value: number }>;
}

function render(gauges: Gauge[]): string {
  const lines: string[] = [];
  for (const g of gauges) {
    lines.push(`# HELP ${g.name} ${g.help}`);
    lines.push(`# TYPE ${g.name} gauge`);
    for (const s of g.samples) {
      const labels = s.labels && Object.keys(s.labels).length
        ? "{" +
          Object.entries(s.labels)
            .map(([k, v]) => `${k}="${esc(v)}"`)
            .join(",") +
          "}"
        : "";
      lines.push(`${g.name}${labels} ${s.value}`);
    }
  }
  return lines.join("\n") + "\n";
}

export async function getMetrics(): Promise<string> {
  const [byStage, byProposalStatus, rfpOpen, assets, orgs] = await Promise.all([
    db.psEngagement.groupBy({
      by: ["stage"],
      where: { deletedAt: null, closedStatus: "open" },
      _count: true,
    }),
    db.psProposal.groupBy({ by: ["status"], _count: true }),
    db.psRfp.count({ where: { status: { notIn: ["submitted"] } } }),
    Promise.all([
      db.psTemplate.count({ where: { deletedAt: null } }),
      db.psDemo.count({ where: { deletedAt: null } }),
      db.psKnowledgeAsset.count({ where: { deletedAt: null } }),
    ]),
    db.psEngagement.findMany({ distinct: ["orgId"], select: { orgId: true } }),
  ]);

  const [templates, demos, knowledge] = assets;

  return render([
    {
      name: "quikpresales_engagements_open",
      help: "Open engagements by pipeline stage.",
      samples: byStage.map((r) => ({ labels: { stage: r.stage }, value: r._count })),
    },
    {
      name: "quikpresales_proposals_total",
      help: "Proposals by status.",
      samples: byProposalStatus.map((r) => ({ labels: { status: r.status }, value: r._count })),
    },
    {
      name: "quikpresales_rfps_open",
      help: "RFPs not yet submitted.",
      samples: [{ value: rfpOpen }],
    },
    {
      name: "quikpresales_library_assets",
      help: "Reusable assets by kind.",
      samples: [
        { labels: { kind: "template" }, value: templates },
        { labels: { kind: "demo" }, value: demos },
        { labels: { kind: "knowledge" }, value: knowledge },
      ],
    },
    {
      name: "quikpresales_active_orgs",
      help: "Orgs with at least one engagement.",
      samples: [{ value: orgs.length }],
    },
  ]);
}
