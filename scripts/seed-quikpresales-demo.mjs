#!/usr/bin/env node
/**
 * seed-quikpresales-demo.mjs — realistic demo data across every module.
 *
 * Purpose: make the portal legible. An empty app reads as "nothing works"; every
 * panel says "no data" and you cannot tell a missing feature from an empty table.
 * This fills every module with data shaped the way real pre-sales data is shaped,
 * so each screen can be judged on its merits.
 *
 * Covers: engagements (several stages, three currencies, deal health), RFPs with
 * extracted requirements and citations, proposals with versions, templates, the
 * demo library plus delivery records, knowledge assets, cost estimates with line
 * items, win/loss, and timeline activity.
 *
 * Idempotent: keyed on (orgId, title) per module, so re-running updates rather
 * than duplicating. Safe to leave in a build.
 *
 * Usage:
 *   DATABASE_URL=… SEED_ADMIN_PASSWORD=… node scripts/seed-quikpresales-demo.mjs
 *
 * Env:
 *   SEED_ADMIN_EMAIL           defaults to himanshu.pandey@moreyeahs.com
 *   SEED_ADMIN_PASSWORD        when set, the admin's password is RESET to it
 *   SEED_DEMO_REMOVE_TESTROWS  when "true", deletes rows named "* test *"
 *
 * Prints no secrets.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", "package.json"));

if (!process.env.DATABASE_URL) {
  console.error("seed: DATABASE_URL is not set");
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const db = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "himanshu.pandey@moreyeahs.com";
const log = (...a) => console.log("seed:", ...a);

/** Days from now, as a Date. Negative for the past. */
const day = (n) => new Date(Date.now() + n * 86_400_000);

/** Minor units. INR/USD/EUR are all exponent 2; kept explicit for clarity. */
const minor = (major, exponent = 2) => BigInt(Math.round(major * 10 ** exponent));

try {
  const org = await db.org.findFirst({ where: { slug: "moreyeahs" }, select: { id: true } });
  if (!org) {
    console.error("seed: MoreYeahs org not found — run provision-quikpresales.mjs first");
    process.exit(1);
  }
  const orgId = org.id;

  const user = await db.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
  if (!user) {
    console.error(`seed: ${ADMIN_EMAIL} not found — run provision-quikpresales.mjs first`);
    process.exit(1);
  }
  const userId = user.id;

  // ── Password reset ────────────────────────────────────────────────────────
  // Unlike the provisioning script, this one DOES reset, because it is the
  // deliberate "set up the demo account" step.
  if (process.env.SEED_ADMIN_PASSWORD) {
    await db.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 10) },
    });
    log(`password reset for ${ADMIN_EMAIL}`);
  }

  // ── Clean up artifacts from manual testing ────────────────────────────────
  if (process.env.SEED_DEMO_REMOVE_TESTROWS === "true") {
    const { count } = await db.psEngagement.deleteMany({
      where: { orgId, OR: [{ title: { contains: "test deal" } }, { title: { contains: "test —" } }] },
    });
    if (count > 0) log(`removed ${count} test engagement(s)`);
  }

  /** Upsert-by-title helper: find one by (orgId, title), create or update. */
  async function upsertByTitle(model, title, data) {
    const existing = await db[model].findFirst({ where: { orgId, title }, select: { id: true } });
    if (existing) {
      await db[model].update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await db[model].create({
      data: { orgId, title, ...data },
      select: { id: true },
    });
    return created.id;
  }

  // ── Engagements ───────────────────────────────────────────────────────────
  const ENGAGEMENTS = [
    {
      title: "Acme Manufacturing — ERP modernisation",
      industry: "Manufacturing", territory: "India", stage: "solution-design",
      estRevenue: minor(4_500_000), currency: "INR", probability: 35,
      competitors: ["Infosys", "TCS"], techStack: ["Dynamics365", "AzureAI"],
      expectedClose: day(45), daysInStage: 12, aiDealHealth: "amber", riskScore: 48,
    },
    {
      title: "Northwind Retail — omnichannel CRM rollout",
      industry: "Retail", territory: "UAE", stage: "proposal",
      estRevenue: minor(320_000), currency: "AED", probability: 60,
      competitors: ["Accenture"], techStack: ["Dynamics365", "PowerPlatform"],
      expectedClose: day(21), daysInStage: 8, aiDealHealth: "green", riskScore: 22,
    },
    {
      title: "Helios Health — patient data platform",
      industry: "Healthcare", territory: "US", stage: "demo",
      estRevenue: minor(480_000), currency: "USD", probability: 40,
      competitors: ["Deloitte", "Cognizant"], techStack: ["AzureAI", "DataEngineering"],
      expectedClose: day(60), daysInStage: 19, aiDealHealth: "amber", riskScore: 55,
    },
    {
      title: "Vertex Logistics — fleet analytics",
      industry: "Logistics", territory: "India", stage: "discovery",
      estRevenue: minor(1_850_000), currency: "INR", probability: 20,
      competitors: [], techStack: ["DataEngineering", "PowerPlatform"],
      expectedClose: day(90), daysInStage: 5, aiDealHealth: "green", riskScore: 18,
    },
    {
      title: "Granite Construction — field service automation",
      industry: "Construction", territory: "India", stage: "qualification",
      estRevenue: minor(720_000), currency: "INR", probability: 10,
      competitors: ["Local SI"], techStack: ["PowerPlatform"],
      expectedClose: day(120), daysInStage: 3,
    },
    {
      title: "Meridian Finance — regulatory reporting",
      industry: "Finance", territory: "UK", stage: "negotiation",
      estRevenue: minor(410_000), currency: "GBP", probability: 75,
      competitors: ["Capgemini"], techStack: ["AzureAI", "DevOps"],
      expectedClose: day(14), daysInStage: 22, aiDealHealth: "red", riskScore: 71,
    },
    {
      title: "Summit Education — student lifecycle portal",
      industry: "Education", territory: "India", stage: "poc",
      estRevenue: minor(960_000), currency: "INR", probability: 50,
      competitors: [], techStack: ["PowerPlatform", "AIAgents"],
      expectedClose: day(35), daysInStage: 15, aiDealHealth: "green", riskScore: 30,
    },
    {
      title: "Ironclad Govt — citizen services gateway",
      industry: "Government", territory: "India", stage: "won",
      closedStatus: "won", estRevenue: minor(2_400_000), currency: "INR", probability: 100,
      competitors: ["Wipro"], techStack: ["Dynamics365", "DevOps"],
      expectedClose: day(-10), daysInStage: 0,
    },
    {
      title: "Bluewave Telecom — billing migration",
      industry: "Telecom", territory: "India", stage: "lost",
      closedStatus: "lost", estRevenue: minor(1_300_000), currency: "INR", probability: 0,
      competitors: ["TCS", "Tech Mahindra"], techStack: ["DataEngineering"],
      expectedClose: day(-25), daysInStage: 0,
    },
  ];

  const engagementIds = {};
  for (const e of ENGAGEMENTS) {
    const { title, ...rest } = e;
    engagementIds[title] = await upsertByTitle("psEngagement", title, {
      closedStatus: "open",
      ...rest,
      ...(rest.aiDealHealth ? { dealHealthUpdatedAt: day(-1) } : {}),
      createdBy: userId,
      updatedBy: userId,
    });
  }
  log(`${ENGAGEMENTS.length} engagements`);

  const acme = engagementIds["Acme Manufacturing — ERP modernisation"];
  const northwind = engagementIds["Northwind Retail — omnichannel CRM rollout"];
  const helios = engagementIds["Helios Health — patient data platform"];

  // ── Templates ─────────────────────────────────────────────────────────────
  const TEMPLATES = [
    ["Discovery questionnaire — manufacturing", "discovery", "Manufacturing"],
    ["Solution design — Dynamics 365 F&O", "solution-design", "Manufacturing"],
    ["Technical architecture — Azure landing zone", "architecture", null],
    ["Statement of work — fixed price", "sow", null],
    ["Statement of work — time & materials", "sow", null],
    ["Scope definition — CRM rollout", "scope", "Retail"],
    ["Estimation model — offshore blended rate", "estimation", null],
    ["Assumptions & risks register", "risk", null],
    ["Project plan — 12-week implementation", "project-plan", null],
    ["Pricing sheet — subscription + services", "pricing", null],
    ["ROI calculator — process automation", "roi", null],
    ["Proposal skeleton — enterprise IT services", "proposal", null],
  ];
  for (const [name, kind, industry] of TEMPLATES) {
    const existing = await db.psTemplate.findFirst({ where: { orgId, name }, select: { id: true } });
    const data = { kind, name, description: `Reusable ${kind.replace(/-/g, " ")} template.`, industry, content: {}, isActive: true, updatedBy: userId };
    if (existing) await db.psTemplate.update({ where: { id: existing.id }, data });
    else await db.psTemplate.create({ data: { orgId, ...data, createdBy: userId } });
  }
  log(`${TEMPLATES.length} templates`);

  // ── Demo library ──────────────────────────────────────────────────────────
  const DEMOS = [
    ["D365 Finance & Operations walkthrough", "Manufacturing", "Dynamics365", 4.6, 5],
    ["Omnichannel retail CRM demo", "Retail", "Dynamics365", 4.8, 4],
    ["Azure AI document intelligence", "Healthcare", "AzureAI", 4.4, 3],
    ["Fleet telemetry dashboard", "Logistics", "DataEngineering", 4.2, 2],
    ["Power Platform field service app", "Construction", "PowerPlatform", 4.7, 3],
    ["Regulatory reporting automation", "Finance", "AzureAI", 4.1, 2],
    ["Student lifecycle self-service portal", "Education", "PowerPlatform", 4.5, 2],
    ["Citizen services chatbot", "Government", "AIAgents", 4.9, 4],
  ];
  for (const [title, industry, technology, score, count] of DEMOS) {
    await upsertByTitle("psDemo", title, {
      industry, technology,
      description: `Scripted ${technology} demo for ${industry.toLowerCase()} prospects.`,
      status: "ready", feedbackScore: score, feedbackCount: count,
      tags: [industry.toLowerCase(), technology.toLowerCase()],
      updatedBy: userId,
    });
  }
  log(`${DEMOS.length} demos`);

  // ── Knowledge assets ──────────────────────────────────────────────────────
  const KNOWLEDGE = [
    ["Acme Foods — D365 rollout case study", "case-study", "Manufacturing", "Dynamics365"],
    ["Retail chain omnichannel success story", "success-story", "Retail", "Dynamics365"],
    ["Helios pilot — AI triage results", "success-story", "Healthcare", "AzureAI"],
    ["Reference: Vertex Logistics CTO", "reference", "Logistics", null],
    ["Reference: Summit Education CIO", "reference", "Education", null],
    ["Security & compliance overview (SOC 2, ISO 27001)", "security-doc", null, null],
    ["Data residency and GDPR position", "security-doc", null, null],
    ["Battle card — vs Accenture", "battle-card", null, null],
    ["Battle card — vs TCS", "battle-card", null, null],
    ["FAQ — implementation timelines", "faq", null, null],
    ["FAQ — support and SLA model", "faq", null, null],
    ["Best practice — phased ERP cutover", "best-practice", "Manufacturing", "Dynamics365"],
    ["Best practice — AI governance for regulated clients", "best-practice", "Finance", "AzureAI"],
  ];
  for (const [title, kind, industry, technology] of KNOWLEDGE) {
    await upsertByTitle("psKnowledgeAsset", title, {
      kind, industry, technology,
      body: `${title}. Reference material used to ground AI proposal drafting: context, outcomes and measurable results.`,
      searchText: title.toLowerCase(),
      tags: [kind, industry, technology].filter(Boolean).map((t) => String(t).toLowerCase()),
      updatedBy: userId,
    });
  }
  log(`${KNOWLEDGE.length} knowledge assets`);

  // ── RFPs with extracted requirements ──────────────────────────────────────
  const RFPS = [
    { title: "Acme Manufacturing RFP — ERP replacement", engagementId: acme, status: "extracted", dueDate: day(10) },
    { title: "Helios Health RFP — data platform", engagementId: helios, status: "responded", dueDate: day(18) },
    { title: "Northwind Retail RFQ — CRM licences + services", engagementId: northwind, status: "uploaded", dueDate: day(30) },
  ];
  const REQUIREMENTS = [
    ["Support multi-plant inventory with lot traceability", "Functional", "compliant", 1],
    ["Integrate with existing SAP payroll via REST", "Integration", "partial", 2],
    ["Provide role-based access aligned to SOX controls", "Security", "compliant", 2],
    ["Offer 99.9% uptime SLA with penalty clauses", "Commercial", "clarify", 3],
    ["Deliver mobile shop-floor data capture offline", "Functional", "gap", 4],
    ["Complete cutover within a single weekend window", "Delivery", "partial", 5],
  ];
  let reqTotal = 0;
  for (const rfp of RFPS) {
    const id = await upsertByTitle("psRfp", rfp.title, {
      engagementId: rfp.engagementId, status: rfp.status, dueDate: rfp.dueDate, updatedBy: userId,
    });
    if (rfp.status !== "uploaded") {
      const have = await db.psRfpRequirement.count({ where: { orgId, rfpId: id } });
      if (have === 0) {
        await db.psRfpRequirement.createMany({
          data: REQUIREMENTS.map(([text, category, complianceStatus, page], i) => ({
            orgId, rfpId: id, text, category, complianceStatus,
            citation: { page, quotedText: text.slice(0, 60) },
            responseText: complianceStatus === "compliant" ? "Met natively by the proposed solution." : null,
            aiGenerated: true, sortOrder: i,
          })),
        });
        reqTotal += REQUIREMENTS.length;
      }
    }
  }
  log(`${RFPS.length} RFPs, ${reqTotal} requirements`);

  // ── Proposals with versions ───────────────────────────────────────────────
  const SECTIONS = [
    ["executive-summary", "Executive Summary", "<p>A phased modernisation that de-risks cutover while delivering measurable value in the first quarter.</p>"],
    ["company-overview", "Company Overview", "<p>MoreYeahs delivers Microsoft-centric transformation for mid-market and enterprise clients.</p>"],
    ["understanding", "Understanding of Requirements", "<p>Six requirements were extracted from the RFP; four are met natively and two need clarification.</p>"],
    ["scope", "Scope of Work", "<p>Discovery, solution design, build, data migration, UAT and hypercare.</p>"],
    ["functional-solution", "Functional Solution", "<p>Multi-plant inventory, lot traceability and shop-floor capture.</p>"],
    ["proposed-solution", "Technical Solution", "<p>Dynamics 365 F&O with Azure integration services.</p>"],
    ["architecture", "Technical Architecture", "<p>Hub-and-spoke landing zone with private endpoints.</p>"],
    ["timeline", "Timeline & Milestones", "<p>16 weeks across four milestones.</p>"],
    ["team", "Team & Governance", "<p>Blended onshore/offshore pod with a named engagement lead.</p>"],
    ["pricing", "Commercials", "<p>Fixed price for build, T&M for change requests.</p>"],
    ["assumptions", "Assumptions & Risks", "<p>Client provides test data by week two.</p>"],
    ["sla", "Service Levels", "<p>99.9% availability with defined response and resolution targets.</p>"],
    ["security", "Security", "<p>SOC 2 aligned controls, encryption in transit and at rest.</p>"],
    ["compliance", "Compliance", "<p>GDPR and local data residency addressed.</p>"],
    ["case-studies", "Case Studies & References", "<p>Two comparable rollouts, references available.</p>"],
    ["why-us", "Why MoreYeahs", "<p>Domain depth, certified team, and a delivery record in this exact stack.</p>"],
  ].map(([slug, title, html]) => ({ slug, title, html }));

  const PROPOSALS = [
    ["Acme Manufacturing — ERP proposal v2", acme, "internal-review"],
    ["Helios Health — data platform proposal", helios, "customer-review"],
    ["Northwind Retail — CRM proposal", northwind, "draft"],
  ];
  for (const [title, engagementId, status] of PROPOSALS) {
    const existing = await db.psProposal.findFirst({ where: { orgId, title }, select: { id: true, currentVersionId: true } });
    let proposalId = existing?.id;
    if (!proposalId) {
      const created = await db.psProposal.create({
        data: { orgId, engagementId, title, status, createdBy: userId },
        select: { id: true },
      });
      proposalId = created.id;
    } else {
      await db.psProposal.update({ where: { id: proposalId }, data: { status } });
    }

    const versions = await db.psProposalVersion.count({ where: { orgId, proposalId } });
    if (versions === 0) {
      const v1 = await db.psProposalVersion.create({
        data: {
          orgId, proposalId, version: 1,
          sections: status === "draft" ? SECTIONS.map((s) => ({ ...s, html: "" })) : SECTIONS,
          changeNote: "Initial draft", source: "claude", createdBy: userId,
        },
        select: { id: true },
      });
      await db.psProposal.update({ where: { id: proposalId }, data: { currentVersionId: v1.id } });
    }
  }
  log(`${PROPOSALS.length} proposals with versions`);

  // ── Cost estimates with line items ────────────────────────────────────────
  const ESTIMATES = [
    { title: "Acme ERP — build estimate", engagementId: acme, currency: "INR", status: "approved",
      lines: [
        ["Solution architect", "Architect", 20, "days", minor(18_000)],
        ["Functional consultant — finance", "Consultant", 45, "days", minor(12_000)],
        ["Developer — integrations", "Developer", 60, "days", minor(9_500)],
        ["Data migration specialist", "Specialist", 25, "days", minor(11_000)],
        ["Test lead", "QA", 30, "days", minor(8_500)],
        ["Project management (15%)", "PM", 1, "lot", minor(285_000)],
      ] },
    { title: "Helios data platform — discovery estimate", engagementId: helios, currency: "USD", status: "draft",
      lines: [
        ["Discovery workshops", "Architect", 8, "days", minor(1_400)],
        ["Data assessment", "Specialist", 12, "days", minor(1_100)],
        ["Target architecture", "Architect", 6, "days", minor(1_400)],
      ] },
  ];
  for (const est of ESTIMATES) {
    const existing = await db.psCostEstimate.findFirst({ where: { orgId, title: est.title }, select: { id: true } });
    const lines = est.lines.map(([description, role, quantity, unit, rate], i) => {
      const amount = BigInt(Math.round(Number(rate) * quantity));
      return { orgId, description, role, quantity, unit, rate, amount, sortOrder: i };
    });
    const totalAmount = lines.reduce((a, l) => a + l.amount, 0n);

    if (existing) {
      await db.psEstimateLine.deleteMany({ where: { orgId, estimateId: existing.id } });
      await db.psCostEstimate.update({
        where: { id: existing.id },
        data: { currency: est.currency, status: est.status, totalAmount, updatedBy: userId,
          lines: { create: lines.map(({ orgId: _o, ...l }) => ({ orgId, ...l })) } },
      });
    } else {
      await db.psCostEstimate.create({
        data: { orgId, engagementId: est.engagementId, title: est.title, currency: est.currency,
          status: est.status, totalAmount, assumptions: "Rates exclude taxes and travel.",
          createdBy: userId, lines: { create: lines.map(({ orgId: _o, ...l }) => ({ orgId, ...l })) } },
      });
    }
  }
  log(`${ESTIMATES.length} estimates with line items`);

  // ── Win/loss ──────────────────────────────────────────────────────────────
  const WINLOSS = [
    [engagementIds["Ironclad Govt — citizen services gateway"], "won", "Wipro", "price", "Sharper commercial model and a credible delivery plan.", "Reference-led selling worked; reuse the citizen-services demo.", minor(2_400_000)],
    [engagementIds["Bluewave Telecom — billing migration"], "lost", "TCS", "capability", "Incumbent had deeper billing-domain staff on the bench.", "Build billing-domain battle card and two named references.", minor(1_300_000)],
  ];
  for (const [engagementId, outcome, competitor, reasonCategory, reasonText, lessons, dealSize] of WINLOSS) {
    if (!engagementId) continue;
    const existing = await db.psWinLoss.findFirst({ where: { orgId, engagementId }, select: { id: true } });
    // PsWinLoss tracks who captured it as `capturedById` — it has no
    // createdBy/updatedBy columns, unlike most models here.
    const data = { outcome, competitor, reasonCategory, reasonText, lessons, dealSize, capturedById: userId };
    if (existing) await db.psWinLoss.update({ where: { id: existing.id }, data });
    else await db.psWinLoss.create({ data: { orgId, engagementId, ...data } });
  }
  log(`${WINLOSS.length} win/loss records`);

  // ── Timeline activity, including demo deliveries ──────────────────────────
  // demo-delivered is what the weekly report counts; without it that metric
  // reads 0 no matter how much other data exists.
  const EVENTS = [
    [acme, "created", "Engagement created from QuikCRM opportunity", {}],
    [acme, "stage-advanced", "Moved from Discovery to Solution Design", { fromStage: "discovery", toStage: "solution-design" }],
    [acme, "rfp-extracted", "Extracted 6 requirements from the RFP", { count: 6 }],
    [acme, "demo-delivered", 'Delivered "D365 Finance & Operations walkthrough" demo — rated 5/5',
      { demoTitle: "D365 Finance & Operations walkthrough", technology: "Dynamics365", outcome: "positive", feedbackScore: 5, audience: ["CFO", "Plant Head"], deliveredAt: day(-4).toISOString() }],
    [helios, "demo-delivered", 'Delivered "Azure AI document intelligence" demo — rated 4/5',
      { demoTitle: "Azure AI document intelligence", technology: "AzureAI", outcome: "positive", feedbackScore: 4, audience: ["CMIO", "Head of Data"], deliveredAt: day(-2).toISOString() }],
    [northwind, "demo-delivered", 'Delivered "Omnichannel retail CRM demo" demo',
      { demoTitle: "Omnichannel retail CRM demo", technology: "Dynamics365", outcome: "neutral", audience: ["Retail Ops Director"], deliveredAt: day(-6).toISOString() }],
    [northwind, "proposal-created", "Proposal drafted for Northwind Retail", {}],
    [helios, "deal-health-assessed", "Deal health assessed as amber (risk 55/100)", { health: "amber", riskScore: 55 }],
  ];
  const haveEvents = await db.psTimelineEvent.count({ where: { orgId, type: "demo-delivered" } });
  if (haveEvents === 0) {
    for (const [engagementId, type, summary, payload] of EVENTS) {
      if (!engagementId) continue;
      await db.psTimelineEvent.create({
        data: { orgId, engagementId, type, actorId: userId, summary, payload },
      });
    }
    log(`${EVENTS.length} timeline events`);
  } else {
    log("timeline events already present");
  }

  // ── Stage history, so the workspace tracker tells a story ────────────────
  // The engagements above are created directly at their current stage, which
  // leaves no stage-advanced events — and the tracker correctly renders every
  // earlier stage as "skipped" rather than complete. Demo data should demonstrate
  // the design, so walk each deal through the stages it plausibly passed.
  const STAGE_PATH = [
    "lead", "qualification", "discovery", "solution-design",
    "demo", "poc", "proposal", "negotiation",
  ];
  const haveStageHistory = await db.psTimelineEvent.count({
    where: { orgId, type: "stage-advanced" },
  });
  if (haveStageHistory === 0) {
    let written = 0;
    for (const e of ENGAGEMENTS) {
      const id = engagementIds[e.title];
      if (!id) continue;
      // For won/lost/rejected deals, walk the whole path; otherwise stop at the
      // current stage.
      const endIndex = STAGE_PATH.includes(e.stage)
        ? STAGE_PATH.indexOf(e.stage)
        : STAGE_PATH.length - 1;

      for (let i = 1; i <= endIndex; i++) {
        // Space the transitions backwards so earlier stages carry earlier dates.
        const daysAgo = (endIndex - i + 1) * 9 + 2;
        await db.psTimelineEvent.create({
          data: {
            orgId,
            engagementId: id,
            type: "stage-advanced",
            actorId: userId,
            summary: `Moved from ${STAGE_PATH[i - 1]} to ${STAGE_PATH[i]}`,
            payload: { fromStage: STAGE_PATH[i - 1], toStage: STAGE_PATH[i] },
            createdAt: day(-daysAgo),
          },
        });
        written += 1;
      }
    }
    log(`${written} stage-advanced events`);
  } else {
    log("stage history already present");
  }

  // ── Rich deal-health payloads ────────────────────────────────────────────
  // The six-dimension panel, win probability, biggest risk and next step all read
  // from the timeline payload. Seeded events written before those fields existed
  // render an empty panel, so rewrite them with the full shape.
  const DIMENSION_NAMES = [
    "Engagement", "Requirements", "Solution Fit",
    "Competition", "Commercial", "Executive Support",
  ];
  const HEALTH_PROFILE = {
    green: { win: 72, statuses: ["good", "good", "good", "at-risk", "good", "good"] },
    amber: { win: 48, statuses: ["at-risk", "good", "good", "at-risk", "at-risk", "unknown"] },
    red: { win: 21, statuses: ["weak", "at-risk", "at-risk", "weak", "weak", "weak"] },
  };
  for (const e of ENGAGEMENTS) {
    if (!e.aiDealHealth) continue;
    const id = engagementIds[e.title];
    if (!id) continue;

    const profile = HEALTH_PROFILE[e.aiDealHealth];
    const payload = {
      health: e.aiDealHealth,
      riskScore: e.riskScore ?? 50,
      winProbabilityPct: profile.win,
      rationale:
        e.aiDealHealth === "red"
          ? `${e.daysInStage} days in this stage with a close date inside two weeks and a named incumbent.`
          : e.aiDealHealth === "amber"
            ? `${e.daysInStage} days in this stage; requirements are captured but commercial terms are unconfirmed.`
            : `Recent activity, requirements captured and no material commercial concerns.`,
      dimensions: DIMENSION_NAMES.map((name, i) => ({
        name,
        status: profile.statuses[i],
        note: `${name} assessed from pipeline signals.`,
      })),
      biggestRisk:
        e.aiDealHealth === "green"
          ? { title: "Competitor discount pressure", severity: "low", detail: "Named competitor may undercut on price." }
          : {
              title: e.aiDealHealth === "red" ? "Close date will slip" : "Commercials unconfirmed",
              severity: e.aiDealHealth === "red" ? "high" : "medium",
              detail:
                e.aiDealHealth === "red"
                  ? "Negotiation has run long with no signed position and the target close is imminent."
                  : "No approved budget range has been confirmed against the proposed scope.",
            },
      recommendedNextStep:
        e.aiDealHealth === "red"
          ? { action: "Escalate to an executive sponsor meeting this week", why: "Only senior air cover will hold the current close date." }
          : { action: "Confirm the approved budget range with the buyer", why: "Unblocks a firm commercial proposal." },
      risks:
        e.aiDealHealth === "green"
          ? ["Competitor pricing pressure"]
          : ["Commercial terms unconfirmed", "Decision process not fully mapped"],
      nextActions: ["Confirm budget range", "Schedule the technical deep-dive"],
      isStub: false,
    };

    const existing = await db.psTimelineEvent.findFirst({
      where: { orgId, engagementId: id, type: "deal-health-assessed" },
      select: { id: true },
    });
    if (existing) {
      await db.psTimelineEvent.update({ where: { id: existing.id }, data: { payload } });
    } else {
      await db.psTimelineEvent.create({
        data: {
          orgId,
          engagementId: id,
          type: "deal-health-assessed",
          actorId: userId,
          summary: `Deal health assessed as ${e.aiDealHealth} (risk ${e.riskScore ?? 50}/100)`,
          payload,
          createdAt: day(-1),
        },
      });
    }
  }
  log(`deal-health payloads written for ${ENGAGEMENTS.filter((e) => e.aiDealHealth).length} engagements`);

  const counts = {
    engagements: await db.psEngagement.count({ where: { orgId, deletedAt: null } }),
    templates: await db.psTemplate.count({ where: { orgId } }),
    demos: await db.psDemo.count({ where: { orgId, deletedAt: null } }),
    knowledge: await db.psKnowledgeAsset.count({ where: { orgId, deletedAt: null } }),
    rfps: await db.psRfp.count({ where: { orgId } }),
    requirements: await db.psRfpRequirement.count({ where: { orgId } }),
    proposals: await db.psProposal.count({ where: { orgId } }),
    estimates: await db.psCostEstimate.count({ where: { orgId } }),
    winLoss: await db.psWinLoss.count({ where: { orgId } }),
  };
  const reusable = counts.templates + counts.demos + counts.knowledge;
  log(`totals ${JSON.stringify(counts)}`);
  log(`reusable assets: ${reusable}`);
  log("complete");
} catch (e) {
  // Print the whole message, not the first line. Prisma validation errors put a
  // blank line first and the actual reason several lines down, so truncating to
  // line one reports "seed FAILED:" and nothing else — which is what happened.
  console.error("seed FAILED:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
