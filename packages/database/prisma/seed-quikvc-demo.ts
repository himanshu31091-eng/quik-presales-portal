/**
 * QuikVC demo seed — rich data on top of seed-quikvc.ts.
 *
 * Run: npx tsx prisma/seed-quikvc-demo.ts
 * Pre-req: seed-quikvc.ts must have run first.
 *
 * Populates every empty screen end-to-end:
 *   sourced opportunities → documents → Q&A → signals → scores → memos →
 *   IC votes → investors → commitments → allocations → repayments →
 *   term sheets → notifications → audit log
 *
 * Idempotent — uses deterministic IDs.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TENANT_SLUG = "valleynxt";

async function main() {
  console.log("🌱 QuikVC demo data seeding (rich layer)...\n");

  const tenant = await db.org.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });
  if (!tenant) {
    throw new Error(`Tenant '${TENANT_SLUG}' not found — run seed-quikvc.ts first.`);
  }
  const tenantId = tenant.id;

  // Resolve users
  const users = await db.user.findMany({
    where: {
      email: {
        in: [
          "fund@valleynxt.test",
          "partner@valleynxt.test",
          "analyst@valleynxt.test",
          "founder1@example.test",
          "founder2@example.test",
          "investor1@valleynxt.test",
        ],
      },
    },
    select: { id: true, email: true },
  });
  const u = Object.fromEntries(users.map((x) => [x.email, x.id] as const));
  const fundAdminId = u["fund@valleynxt.test"]!;
  const partnerId = u["partner@valleynxt.test"]!;
  const analystId = u["analyst@valleynxt.test"]!;
  const founderId = u["founder1@example.test"]!;
  const investorUserId = u["investor1@valleynxt.test"]!;

  // Resolve deals + verticals
  const deals = await db.vCDeal.findMany({
    where: { tenantId },
    include: { application: { select: { startupName: true, fundingAsk: true } } },
  });
  const dealByName = Object.fromEntries(
    deals.map((d) => [d.application.startupName, d] as const),
  );

  const verticals = await db.vCVertical.findMany({
    where: { tenantId },
    select: { id: true, slug: true },
  });
  const vBySlug = Object.fromEntries(verticals.map((v) => [v.slug, v.id] as const));

  // ─── 1. Sourced opportunities ─────────────────────────────────────────────
  console.log("→ Sourced opportunities");
  const sourcedSeed = [
    { id: "seed-src-cropverse",   startupName: "CropVerse",   contactName: "Aman Reddy",    contactEmail: "aman@cropverse.test",    website: "https://cropverse.test",   pitch: "AI-driven crop yield prediction for smallholder farms in India. 200 farms onboarded across 3 states; ₹4L MRR.", verticalSlug: "agritech",        fundingAskLakhs: 80,  thesisFitScore: 78, thesisFitReason: "Strong fit for AgriTech vertical; meaningful traction signal.", status: "qualified", source: "email"    },
    { id: "seed-src-paymesh",     startupName: "PayMesh",     contactName: "Tara Nair",     contactEmail: "tara@paymesh.test",      website: "https://paymesh.test",     pitch: "B2B payment rails for cross-border remittances; piloting with 3 SME exporters.",                              verticalSlug: "fintech",         fundingAskLakhs: 150, thesisFitScore: 65, thesisFitReason: "FinTech fit but cross-border remittance is crowded; team strength TBD.",  status: "reviewing", source: "manual"   },
    { id: "seed-src-medisense",   startupName: "MediSense",   contactName: "Rohit Kapoor",  contactEmail: "rohit@medisense.test",   website: "https://medisense.test",   pitch: "Direct-to-consumer diagnostic kits for diabetes monitoring. Pre-launch with manufacturing partner.",         verticalSlug: "healthtech-d2c",  fundingAskLakhs: 250, thesisFitScore: 72, thesisFitReason: "HealthTech & D2C alignment; needs traction validation.",                  status: "new",       source: "referral" },
    { id: "seed-src-loomstack",   startupName: "LoomStack",   contactName: "Diya Mehta",    contactEmail: "diya@loomstack.test",    website: null,                       pitch: "Vertical SaaS for handloom co-operatives — order management, payments, GST.",                                 verticalSlug: "saas",            fundingAskLakhs: 60,  thesisFitScore: null, thesisFitReason: null,                                                                       status: "new",       source: "csv"      },
    { id: "seed-src-dronebridge", startupName: "DroneBridge", contactName: "Karan Jain",    contactEmail: "karan@dronebridge.test", website: "https://dronebridge.test", pitch: "Last-mile delivery via drones for tier-2 e-commerce. 500 deliveries/day pilot in Indore.",                    verticalSlug: "logistics",       fundingAskLakhs: 300, thesisFitScore: null, thesisFitReason: null,                                                                       status: "rejected",  source: "manual",  notes: "Hardware-heavy; capital intensity exceeds fund thesis." },
  ];

  for (const s of sourcedSeed) {
    await db.vCSourcedOpportunity.upsert({
      where: { id: s.id },
      update: {
        startupName: s.startupName,
        verticalId: vBySlug[s.verticalSlug] ?? null,
        thesisFitScore: s.thesisFitScore,
        thesisFitReason: s.thesisFitReason,
        status: s.status,
      },
      create: {
        id: s.id,
        tenantId,
        startupName: s.startupName,
        contactName: s.contactName,
        contactEmail: s.contactEmail,
        website: s.website,
        pitch: s.pitch,
        verticalId: vBySlug[s.verticalSlug] ?? null,
        fundingAsk: BigInt(s.fundingAskLakhs) * BigInt(10_000_000),
        thesisFitScore: s.thesisFitScore,
        thesisFitReason: s.thesisFitReason,
        status: s.status,
        source: s.source,
        notes: "notes" in s ? s.notes : null,
        createdBy: analystId,
        updatedBy: analystId,
      },
    });
  }
  console.log(`  ✓ ${sourcedSeed.length} sourced opportunities`);

  // ─── 2. Documents per deal ────────────────────────────────────────────────
  console.log("→ Deal documents");
  const docsByStage: Record<string, string[]> = {
    "intake":         ["pitch-deck"],
    "onboarding":     ["pitch-deck", "cap-table"],
    "research":       ["pitch-deck", "cap-table", "financial-model", "team-bios"],
    "ic-review":      ["pitch-deck", "cap-table", "financial-model", "team-bios", "ic-memo"],
    "final-decision": ["pitch-deck", "cap-table", "financial-model", "team-bios", "ic-memo", "term-sheet-signed"],
  };
  let docCount = 0;
  for (const deal of deals) {
    const cats = docsByStage[deal.currentStage] ?? [];
    for (const category of cats) {
      const docId = `seed-doc-${deal.id}-${category}`;
      await db.vCDealDocument.upsert({
        where: { id: docId },
        update: {},
        create: {
          id: docId,
          tenantId,
          dealId: deal.id,
          category,
          filename: `${deal.application.startupName.toLowerCase()}-${category}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1024 * 256,
          blobUrl: `https://blob.example.test/${docId}.pdf`,
          status: "accepted",
          uploadedById: founderId,
        },
      });
      docCount++;
    }
  }
  console.log(`  ✓ ${docCount} documents across ${deals.length} deals`);

  // ─── 3. Q&A ───────────────────────────────────────────────────────────────
  console.log("→ Q&A threads");
  const qa = [
    { dealName: "PaystarRails", q: "Can you share a 6-month MRR breakdown by customer segment?",            status: "open" },
    { dealName: "PaystarRails", q: "What's the churn rate over the last 4 quarters?",                      status: "answered", a: "Annual churn is 8%; we track monthly cohort retention." },
    { dealName: "FieldRoots",   q: "Distribution model — direct vs. partner channel?",                     status: "answered", a: "Hybrid. 60% direct via field agents, 40% via FPO partnerships." },
    { dealName: "FieldRoots",   q: "Unit economics on the supply-chain integration product?",              status: "open" },
    { dealName: "VitalNudge",   q: "Regulatory pathway for the wellness platform — DPDP Act compliance?",  status: "answered", a: "We've onboarded a privacy counsel; DPIA in progress." },
  ];
  for (let i = 0; i < qa.length; i++) {
    const x = qa[i];
    const deal = dealByName[x.dealName];
    if (!deal) continue;
    await db.vCDealQuestion.upsert({
      where: { id: `seed-q-${i}` },
      update: {},
      create: {
        id: `seed-q-${i}`,
        tenantId,
        dealId: deal.id,
        askedById: analystId,
        question: x.q,
        answer: "a" in x ? x.a : null,
        answeredById: "a" in x ? founderId : null,
        answeredAt: "a" in x ? new Date() : null,
        status: x.status,
      },
    });
  }
  console.log(`  ✓ ${qa.length} Q&A items`);

  // ─── 4. Risk signals ──────────────────────────────────────────────────────
  console.log("→ Risk signals");
  const sigs = [
    { dealName: "FieldRoots",  severity: "amber", title: "Customer concentration",      description: "Top 2 customers = 45% of revenue.",        status: "open" },
    { dealName: "FieldRoots",  severity: "green", title: "Strong pilot conversion",     description: "80% of pilots converted to paid in 90 days.", status: "open" },
    { dealName: "VitalNudge",  severity: "red",   title: "Burn rate trending up",       description: "Monthly burn up 35% QoQ; runway < 9 months.", status: "open" },
    { dealName: "VitalNudge",  severity: "amber", title: "Founder dependency",          description: "Most key relationships sit with the CEO.",  status: "open" },
    { dealName: "RouteCanvas", severity: "green", title: "Defensible tech",             description: "Patent filed for routing algorithm.",       status: "resolved" },
  ];
  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i];
    const deal = dealByName[s.dealName];
    if (!deal) continue;
    await db.vCDealSignal.upsert({
      where: { id: `seed-sig-${i}` },
      update: {},
      create: {
        id: `seed-sig-${i}`,
        tenantId,
        dealId: deal.id,
        severity: s.severity,
        source: "manual",
        title: s.title,
        description: s.description,
        status: s.status,
        ownerId: analystId,
        createdBy: analystId,
      },
    });
  }
  console.log(`  ✓ ${sigs.length} risk signals`);

  // ─── 5. Per-criterion scores ──────────────────────────────────────────────
  console.log("→ Per-criterion scores");
  const criteria = await db.vCScoringCriterion.findMany({
    where: { tenantId },
    select: { slug: true, verticalId: true },
  });
  let scoreCount = 0;
  const dealsWithScores = deals.filter((d) =>
    ["research", "ic-review", "final-decision", "due-diligence"].includes(d.currentStage),
  );
  for (const deal of dealsWithScores) {
    const dealCriteria = criteria.filter((c) => c.verticalId === deal.verticalId);
    for (const c of dealCriteria) {
      const base = deal.aiScore ?? 70;
      const variance = (c.slug.charCodeAt(0) % 7) - 3;
      const score = Math.max(10, Math.min(100, base + variance * 5));
      await db.vCDealScore.upsert({
        where: {
          tenantId_dealId_criterionSlug: {
            tenantId,
            dealId: deal.id,
            criterionSlug: c.slug,
          },
        },
        update: { aiScore: score },
        create: {
          tenantId,
          dealId: deal.id,
          criterionSlug: c.slug,
          aiScore: score,
        },
      });
      scoreCount++;
    }
  }
  console.log(`  ✓ ${scoreCount} per-criterion scores across ${dealsWithScores.length} deals`);

  // ─── 6. IC memos (frozen on ic-review + later) ────────────────────────────
  console.log("→ IC memos");
  const memoStages = ["research", "ic-review", "final-decision"];
  const memoByDealId: Record<string, string> = {};
  for (const deal of deals) {
    if (!memoStages.includes(deal.currentStage)) continue;
    const askLakhs = deal.application.fundingAsk
      ? Number(deal.application.fundingAsk / BigInt(10_000_000))
      : 100;
    const sections = [
      { id: "s1", slug: "executive-summary", title: "Executive Summary",   contentHtml: `<p><strong>${deal.application.startupName}</strong> at an inflection point — solid early traction with a clear path to ₹2cr ARR within 18 months.</p>`, generatedBy: "claude" },
      { id: "s2", slug: "business-overview", title: "Business Overview",   contentHtml: `<p>${deal.application.startupName} operates in a high-growth segment with a focus on early-stage market capture.</p>`,                                                          generatedBy: "claude" },
      { id: "s3", slug: "team",              title: "Team",                contentHtml: `<p>Founding team brings 12+ years combined domain experience. CEO previously built and exited a related vertical SaaS.</p>`,                                                generatedBy: "manual" },
      { id: "s4", slug: "market",            title: "Market & Competition",contentHtml: `<p>TAM ₹4,500cr by 2027. 3 incumbents but none focused on tier-2 segments where this team has built distribution moat.</p>`,                                                generatedBy: "claude" },
      { id: "s5", slug: "financials",        title: "Financials & Ask",    contentHtml: `<p>₹${askLakhs}L raise across 18-month runway. Path to break-even by month 14 in base case.</p>`,                                                                          generatedBy: "manual" },
      { id: "s6", slug: "risks",             title: "Key Risks",           contentHtml: `<p>Customer concentration (top 2 = 45% revenue). Burn rate accelerating. Mitigated via planned hires + targeted enterprise wins.</p>`,                                       generatedBy: "manual" },
      { id: "s7", slug: "recommendation",    title: "Recommendation",      contentHtml: `<p><strong>Approve</strong> with conditions: monthly board reporting, hiring milestones tied to next tranche.</p>`,                                                          generatedBy: "manual" },
    ];

    const memoId = `seed-memo-${deal.id}`;
    const versionId = `seed-mver-${deal.id}`;
    const isFrozen = deal.currentStage !== "research";
    const status = isFrozen ? "frozen" : "draft";

    await db.vCICMemo.upsert({
      where: { id: memoId },
      update: { status },
      create: {
        id: memoId,
        tenantId,
        dealId: deal.id,
        status,
        createdBy: analystId,
        updatedBy: analystId,
      },
    });
    await db.vCICMemoVersion.upsert({
      where: { id: versionId },
      update: { sections: sections as never },
      create: {
        id: versionId,
        tenantId,
        memoId,
        version: 1,
        sections: sections as never,
        source: "analyst-edit",
        createdBy: analystId,
      },
    });
    await db.vCICMemo.update({
      where: { id: memoId },
      data: { currentVersionId: versionId },
    });
    memoByDealId[deal.id] = memoId;
  }
  console.log(`  ✓ ${Object.keys(memoByDealId).length} IC memos`);

  // ─── 7. IC votes on VitalNudge ────────────────────────────────────────────
  console.log("→ IC votes");
  const vital = dealByName["VitalNudge"];
  if (vital && memoByDealId[vital.id]) {
    const memoId = memoByDealId[vital.id];
    const votes = [
      { voterId: partnerId,   decision: "approve",             rationale: "Strong team + AI moat. Worth the burn risk.",                          conditions: null },
      { voterId: fundAdminId, decision: "conditional-approve", rationale: "Approve with monthly burn reporting tied to next tranche.",            conditions: "Monthly cash flow review with fund admin." },
    ];
    for (const v of votes) {
      await db.vCICVote.upsert({
        where: { memoId_voterId: { memoId, voterId: v.voterId } },
        update: { decision: v.decision, rationale: v.rationale, conditions: v.conditions },
        create: {
          tenantId,
          memoId,
          voterId: v.voterId,
          decision: v.decision,
          rationale: v.rationale,
          conditions: v.conditions,
        },
      });
    }
    console.log(`  ✓ ${votes.length} IC votes on VitalNudge`);
  }

  // ─── 8. Investors + commitments ───────────────────────────────────────────
  console.log("→ Investors + commitments");
  const investorsSeed = [
    { id: "seed-inv-bharatcap", name: "Bharat Capital LP",        type: "lp",    email: "ops@bharatcap.test",       userId: null,            kycStatus: "verified", accountClass: "accredited", commitmentLakhs: 1000, commitmentType: "scheduled" },
    { id: "seed-inv-krishnan",  name: "Krishnan Subramanian",     type: "hni",   email: "investor1@valleynxt.test", userId: investorUserId,  kycStatus: "verified", accountClass: "accredited", commitmentLakhs: 250,  commitmentType: "one-shot"  },
    { id: "seed-inv-pallavi",   name: "Pallavi Krishnan",         type: "angel", email: "pallavi@example.test",     userId: null,            kycStatus: "verified", accountClass: null,         commitmentLakhs: 100,  commitmentType: "one-shot"  },
    { id: "seed-inv-mfo",       name: "Western Multi-Family Office", type: "lp",  email: "team@wmfo.test",          userId: null,            kycStatus: "pending",  accountClass: null,         commitmentLakhs: 500,  commitmentType: "scheduled" },
  ];
  for (const inv of investorsSeed) {
    await db.vCInvestor.upsert({
      where: { id: inv.id },
      update: { name: inv.name, kycStatus: inv.kycStatus },
      create: {
        id: inv.id,
        tenantId,
        name: inv.name,
        type: inv.type,
        email: inv.email,
        userId: inv.userId,
        kycStatus: inv.kycStatus,
        accountClass: inv.accountClass,
        createdBy: fundAdminId,
        updatedBy: fundAdminId,
      },
    });
    await db.vCCommitment.upsert({
      where: { id: `seed-com-${inv.id}` },
      update: { totalAmount: BigInt(inv.commitmentLakhs) * BigInt(10_000_000) },
      create: {
        id: `seed-com-${inv.id}`,
        tenantId,
        investorId: inv.id,
        type: inv.commitmentType,
        totalAmount: BigInt(inv.commitmentLakhs) * BigInt(10_000_000),
        currency: "INR",
        vintageYear: 2025,
        status: "active",
        createdBy: fundAdminId,
        updatedBy: fundAdminId,
      },
    });
  }
  console.log(`  ✓ ${investorsSeed.length} investors + commitments`);

  // ─── 9. Allocations on RouteCanvas ────────────────────────────────────────
  console.log("→ Capital allocations");
  const route = dealByName["RouteCanvas"];
  if (route) {
    const allocs = [
      { investorId: "seed-inv-bharatcap", amountLakhs: 100 },
      { investorId: "seed-inv-krishnan",  amountLakhs: 50  },
      { investorId: "seed-inv-pallavi",   amountLakhs: 30  },
    ];
    let total = BigInt(0);
    for (const a of allocs) {
      const amount = BigInt(a.amountLakhs) * BigInt(10_000_000);
      total += amount;
      await db.vCDealAllocation.upsert({
        where: { dealId_investorId: { dealId: route.id, investorId: a.investorId } },
        update: { amount, status: "confirmed" },
        create: {
          tenantId,
          dealId: route.id,
          investorId: a.investorId,
          amount,
          status: "confirmed",
          createdBy: fundAdminId,
          updatedBy: fundAdminId,
        },
      });
    }
    await db.vCDeal.update({
      where: { id: route.id },
      data: { allocatedAmount: total, closedStatus: "closed-won" },
    });
    console.log(`  ✓ 3 allocations on RouteCanvas totalling ₹180L`);

    // ─── 10. Repayment schedule + payments ───────────────────────────────
    console.log("→ Repayment schedule + payments");
    let payCount = 0;
    for (const a of allocs) {
      const principal = BigInt(a.amountLakhs) * BigInt(10_000_000);
      const principalNum = Number(principal);
      const r = 0.12 / 12;
      const n = 24;
      const pow = Math.pow(1 + r, n);
      const emi = Math.round((principalNum * r * pow) / (pow - 1));
      const totalExpected = BigInt(emi * n);
      const scheduleId = `seed-rsched-${route.id}-${a.investorId}`;

      await db.vCRepaymentSchedule.upsert({
        where: { id: scheduleId },
        update: { totalExpected },
        create: {
          id: scheduleId,
          tenantId,
          dealId: route.id,
          investorId: a.investorId,
          type: "emi",
          totalExpected,
          totalPaid: BigInt(0),
          scheduleJson: { months: n, emiPaise: emi, annualInterestPct: 12 } as never,
          status: "active",
          createdBy: fundAdminId,
          updatedBy: fundAdminId,
        },
      });

      let paid = BigInt(0);
      for (let m = 1; m <= 2; m++) {
        const paidAt = new Date();
        paidAt.setMonth(paidAt.getMonth() - (3 - m));
        const paymentId = `seed-rpay-${route.id}-${a.investorId}-${m}`;
        const amount = BigInt(emi);
        paid += amount;
        await db.vCRepaymentPayment.upsert({
          where: { id: paymentId },
          update: {},
          create: {
            id: paymentId,
            tenantId,
            scheduleId,
            investorId: a.investorId,
            amount,
            paidAt,
            category: "principal",
            reference: `UTR-${a.investorId.slice(-6)}-M${m}`,
            createdBy: fundAdminId,
          },
        });
        payCount++;
      }
      await db.vCRepaymentSchedule.update({
        where: { id: scheduleId },
        data: { totalPaid: paid },
      });
    }
    console.log(`  ✓ 3 EMI schedules × 2 payments = ${payCount} repayment events`);
  }

  // ─── 11. Notifications ────────────────────────────────────────────────────
  console.log("→ Notifications");
  const notifs = [
    { userId: partnerId,      type: "memo-frozen",          title: "IC memo frozen for review",          body: "VitalNudge memo is ready for your IC vote.",                  href: vital ? `/deals/${vital.id}/ic` : "/" },
    { userId: partnerId,      type: "term-sheet-generated", title: "Term sheet v1 generated",            body: "RouteCanvas",                                                  href: route ? `/deals/${route.id}/workbench/term-sheet` : "/" },
    { userId: partnerId,      type: "vote-settled",         title: "IC settled: APPROVED",               body: "RouteCanvas — capital allocation underway.",                   href: route ? `/deals/${route.id}/ic` : "/" },
    { userId: analystId,      type: "deal-assigned",        title: "New deal assigned: BasilSpace",      body: "Intake stage — review pitch deck within 48h.",                 href: dealByName["BasilSpace"] ? `/deals/${dealByName["BasilSpace"].id}` : "/" },
    { userId: analystId,      type: "vote-settled",         title: "IC settled: APPROVED",               body: "RouteCanvas approved by IC.",                                  href: route ? `/deals/${route.id}` : "/" },
    { userId: fundAdminId,    type: "allocation",           title: "₹180L allocated across 3 investors", body: "RouteCanvas funded.",                                          href: route ? `/deals/${route.id}/workbench/funding` : "/" },
    { userId: investorUserId, type: "allocation",           title: "₹50L allocated to a deal",           body: "Capital from your commitment was allocated.",                  href: "/summary" },
    { userId: investorUserId, type: "repayment-payment",    title: "Repayment received: ₹2.4L",          body: "RouteCanvas — schedule status: active.",                       href: "/repayments" },
  ];
  await db.vCNotification.deleteMany({
    where: { tenantId, title: { in: notifs.map((n) => n.title) } },
  });
  await db.vCNotification.createMany({
    data: notifs.map((n) => ({
      tenantId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      href: n.href,
    })),
  });
  console.log(`  ✓ ${notifs.length} notifications`);

  // ─── 12. Audit log ────────────────────────────────────────────────────────
  console.log("→ Audit log");
  await db.vCAuditLog.deleteMany({
    where: {
      tenantId,
      metadata: { path: ["source"], equals: "seed-quikvc-demo" },
    },
  });
  const audits = [
    { userId: partnerId,   action: "ic.settle",                resource: route?.id,                    outcome: "ok",     metadata: { source: "seed-quikvc-demo", outcome: "approved" } },
    { userId: partnerId,   action: "term-sheet.generate",      resource: route?.id,                    outcome: "ok",     metadata: { source: "seed-quikvc-demo", version: 1 } },
    { userId: fundAdminId, action: "allocation.create",        resource: route?.id,                    outcome: "ok",     metadata: { source: "seed-quikvc-demo", investorId: "seed-inv-bharatcap", amountLakhs: 100 } },
    { userId: fundAdminId, action: "fund-profile.update",      resource: null,                         outcome: "ok",     metadata: { source: "seed-quikvc-demo", keys: ["thesis", "dailyBriefHour"] } },
    { userId: analystId,   action: "rbac.deny",                resource: route?.id,                    outcome: "denied", metadata: { source: "seed-quikvc-demo", attemptedAction: "ic.settle", role: "analyst", allowed: ["partner", "fund-admin", "admin"] } },
    { userId: analystId,   action: "deal.advance",             resource: dealByName["FieldRoots"]?.id, outcome: "ok",     metadata: { source: "seed-quikvc-demo", fromStage: "discovery-call", toStage: "research" } },
    { userId: analystId,   action: "rbac.deny",                resource: null,                         outcome: "denied", metadata: { source: "seed-quikvc-demo", attemptedAction: "fund-profile.update", role: "analyst", allowed: ["fund-admin", "admin"] } },
    { userId: analystId,   action: "sourced.score",            resource: "seed-src-cropverse",         outcome: "ok",     metadata: { source: "seed-quikvc-demo", score: 78 } },
  ];
  for (const a of audits) {
    await db.vCAuditLog.create({
      data: {
        tenantId,
        userId: a.userId,
        action: a.action,
        resource: a.resource ?? undefined,
        outcome: a.outcome,
        metadata: a.metadata as never,
      },
    });
  }
  console.log(`  ✓ ${audits.length} audit log entries`);

  // ─── 13. Term sheets ──────────────────────────────────────────────────────
  console.log("→ Term sheets");
  const tsTemplate = `<h1>Term Sheet — {{startup.name}}</h1>
<p>Date: {{today}}</p>
<h2>Investment Summary</h2>
<p>{{fund.name}} (the "Investor") proposes to invest <strong>{{deal.fundingAskFormatted}}</strong> in {{startup.name}} (the "Company").</p>
<h2>Instrument</h2>
<p>{{deal.loanType}} — Tenure {{deal.tenureMonths}} months.</p>
<h2>Use of Proceeds</h2>
<p>{{deal.purpose}}</p>`;

  for (const stage of ["ic-review", "final-decision"] as const) {
    const deal = deals.find((d) => d.currentStage === stage);
    if (!deal) continue;
    await db.vCTermSheet.upsert({
      where: { dealId: deal.id },
      update: { renderedBodyHtml: tsTemplate, version: 1 },
      create: {
        tenantId,
        dealId: deal.id,
        version: 1,
        renderedBodyHtml: tsTemplate,
        status: stage === "final-decision" ? "signed" : "draft",
        createdBy: partnerId,
        updatedBy: partnerId,
      },
    });
  }
  await db.vCTermSheetTemplate.upsert({
    where: { tenantId_name: { tenantId, name: "ValleyNXT Default Term Sheet" } },
    update: { bodyHtml: tsTemplate },
    create: {
      tenantId,
      name: "ValleyNXT Default Term Sheet",
      bodyHtml: tsTemplate,
      createdBy: fundAdminId,
      updatedBy: fundAdminId,
    },
  });
  console.log(`  ✓ Term sheets for ic-review + final-decision deals + tenant template`);

  // ─── 14. Comparable companies ────────────────────────────────────────────
  console.log("→ Comparable companies");
  const compsSeed = [
    { dealName: "VitalNudge",  name: "Cult.fit",   sector: "HealthTech", reason: "Direct comp: digital wellness + behavioral nudges. Series F at ~$500M valuation.", source: "manual",       pinned: true  },
    { dealName: "VitalNudge",  name: "Headspace",  sector: "HealthTech", reason: "International benchmark for behavior-change product loops; ~$3B valuation.",       source: "ai-suggested", pinned: false },
    { dealName: "FieldRoots",  name: "Ninjacart",  sector: "AgriTech",   reason: "B2B agri supply chain; $3B+ raised; closest growth-stage benchmark.",              source: "manual",       pinned: true  },
    { dealName: "FieldRoots",  name: "DeHaat",     sector: "AgriTech",   reason: "Comparable distribution model (FPO-led). Series E.",                              source: "ai-suggested", pinned: false },
    { dealName: "RouteCanvas", name: "Locus.sh",   sector: "Logistics",  reason: "Routing + last-mile orchestration. Series B at $30M valuation.",                  source: "manual",       pinned: true  },
    { dealName: "RouteCanvas", name: "Bringg",     sector: "Logistics",  reason: "Global player; relevant for product moat comparison.",                            source: "ai-suggested", pinned: false },
  ];
  for (let i = 0; i < compsSeed.length; i++) {
    const c = compsSeed[i];
    const deal = dealByName[c.dealName];
    if (!deal) continue;
    await db.vCComparableCompany.upsert({
      where: { id: `seed-comp-${i}` },
      update: { name: c.name, reason: c.reason },
      create: {
        id: `seed-comp-${i}`,
        tenantId,
        dealId: deal.id,
        name: c.name,
        sector: c.sector,
        source: c.source,
        reason: c.reason,
        pinnedAsBenchmark: c.pinned,
        createdBy: analystId,
        updatedBy: analystId,
      },
    });
  }
  console.log(`  ✓ ${compsSeed.length} comparables`);

  // ─── 15. Meetings + transcripts ──────────────────────────────────────────
  console.log("→ Meetings + transcripts");
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const meetingsSeed = [
    {
      dealName: "PaystarRails",
      title: "Discovery call — PaystarRails founders",
      type: "discovery-call",
      status: "completed",
      offsetDays: -10,
      durationMinutes: 45,
      meetingUrl: "https://meet.example.test/paystar-disc",
      agenda: "Walk-through of payment rails product, MRR breakdown, distribution channels.",
      transcript: {
        rawText: "Analyst: Walk us through the founder backgrounds...\nFounder: Both ex-PayU. Built BNPL infra at scale before this.\nAnalyst: MRR trajectory?\nFounder: 4L to 12L over last 6 months. Mostly inbound from D2C exporters.",
        analysis: {
          summary: "Strong founder background (ex-PayU). Revenue tripled in 6 months but customer concentration is unclear.",
          keyPoints: ["Founders ex-PayU with payment infra experience", "MRR 4L to 12L over 6 months", "Customers mostly D2C exporters"],
          redFlags: ["Customer concentration not disclosed in call"],
          actionItems: ["Get top-10 customer revenue split", "Reference check ex-PayU connections"],
          sentiment: "positive",
        },
      },
    },
    {
      dealName: "FieldRoots",
      title: "Partner deep-dive — FieldRoots",
      type: "partner-meeting",
      status: "completed",
      offsetDays: -3,
      durationMinutes: 60,
      meetingUrl: "https://meet.example.test/fieldroots-partner",
      agenda: "Unit economics review + customer concentration mitigation plan.",
      transcript: null,
    },
    {
      dealName: "VitalNudge",
      title: "IC review meeting — VitalNudge",
      type: "ic-review",
      status: "scheduled",
      offsetDays: 2,
      durationMinutes: 60,
      meetingUrl: "https://meet.example.test/vitalnudge-ic",
      agenda: "Vote on memo. Founder NOT joining — internal review only.",
      transcript: null,
    },
    {
      dealName: "RouteCanvas",
      title: "Closing call — RouteCanvas",
      type: "follow-up",
      status: "completed",
      offsetDays: -25,
      durationMinutes: 30,
      meetingUrl: "https://meet.example.test/routecanvas-close",
      agenda: "Term sheet walk-through + signing logistics.",
      transcript: null,
    },
  ];

  for (let i = 0; i < meetingsSeed.length; i++) {
    const m = meetingsSeed[i];
    const deal = dealByName[m.dealName];
    if (!deal) continue;
    const meetingId = `seed-mtg-${i}`;
    await db.vCMeeting.upsert({
      where: { id: meetingId },
      update: { title: m.title, status: m.status },
      create: {
        id: meetingId,
        tenantId,
        dealId: deal.id,
        title: m.title,
        type: m.type,
        status: m.status,
        scheduledAt: new Date(now.getTime() + m.offsetDays * dayMs),
        durationMinutes: m.durationMinutes,
        meetingUrl: m.meetingUrl,
        agenda: m.agenda,
        participants: [
          { name: "Priya Iyer", role: "analyst" },
          { name: "Vikram Mehta", role: "partner" },
        ] as never,
        createdBy: analystId,
        updatedBy: analystId,
      },
    });
    if (m.transcript) {
      await db.vCMeetingTranscript.upsert({
        where: { meetingId },
        update: { rawText: m.transcript.rawText, analysis: m.transcript.analysis as never },
        create: {
          tenantId,
          meetingId,
          rawText: m.transcript.rawText,
          analysis: m.transcript.analysis as never,
          status: "analysed",
          tokensUsed: 850,
        },
      });
    }
  }
  console.log(`  ✓ ${meetingsSeed.length} meetings (with transcripts where applicable)`);

  // ─── 16. Capital calls + payments on RouteCanvas ─────────────────────────
  console.log("→ Capital calls");
  if (route) {
    const allocsForCalls = await db.vCDealAllocation.findMany({
      where: { tenantId, dealId: route.id },
      select: { id: true, investorId: true, amount: true },
    });
    let payCount = 0;
    for (const a of allocsForCalls) {
      const callId = `seed-cc-${a.id}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 20);
      const amountLakhs = Number(a.amount / BigInt(10_000_000));
      const isBharat = a.investorId === "seed-inv-bharatcap";
      const isKrishnan = a.investorId === "seed-inv-krishnan";
      const paidLakhs = isBharat ? amountLakhs : isKrishnan ? Math.floor(amountLakhs / 2) : 0;
      const status = paidLakhs >= amountLakhs ? "paid" : paidLakhs > 0 ? "partial" : "issued";

      await db.vCCapitalCall.upsert({
        where: { id: callId },
        update: { paidAmount: BigInt(paidLakhs) * BigInt(10_000_000), status },
        create: {
          id: callId,
          tenantId,
          investorId: a.investorId,
          allocationId: a.id,
          amount: a.amount,
          paidAmount: BigInt(paidLakhs) * BigInt(10_000_000),
          dueDate,
          status,
          paidAt: status === "paid" ? new Date() : null,
          notes: status === "partial" ? "First tranche received; balance pending." : null,
          createdBy: fundAdminId,
          updatedBy: fundAdminId,
        },
      });

      if (paidLakhs > 0) {
        const paymentId = `seed-ccp-${a.id}`;
        await db.vCCapitalCallPayment.upsert({
          where: { id: paymentId },
          update: {},
          create: {
            id: paymentId,
            tenantId,
            capitalCallId: callId,
            amount: BigInt(paidLakhs) * BigInt(10_000_000),
            paidAt: new Date(now.getTime() - 5 * dayMs),
            reference: `CC-UTR-${a.investorId.slice(-6)}`,
            createdBy: fundAdminId,
          },
        });
        payCount++;
      }
    }
    console.log(`  ✓ 3 capital calls (1 paid, 1 partial, 1 issued) + ${payCount} payments`);
  }

  // ─── 17. Founder-visible timeline events ─────────────────────────────────
  console.log("→ Founder timeline events");
  const founderEvents = [
    { dealName: "BasilSpace",   type: "stage-advanced",       summary: "Application submitted for review",      offsetDays: -5  },
    { dealName: "PaystarRails", type: "doc-uploaded",         summary: "Pitch deck uploaded by founder",        offsetDays: -8  },
    { dealName: "PaystarRails", type: "stage-advanced",       summary: "Moved to Onboarding stage",             offsetDays: -7  },
    { dealName: "PaystarRails", type: "questions-posted",     summary: "Analyst posted 2 follow-up questions",  offsetDays: -3  },
    { dealName: "FieldRoots",   type: "stage-advanced",       summary: "Moved to Research stage",               offsetDays: -10 },
    { dealName: "FieldRoots",   type: "doc-uploaded",         summary: "Financial model uploaded",              offsetDays: -9  },
    { dealName: "VitalNudge",   type: "stage-advanced",       summary: "Moved to IC Review",                    offsetDays: -2  },
    { dealName: "VitalNudge",   type: "memo-frozen",          summary: "IC memo finalised for review",          offsetDays: -2  },
    { dealName: "RouteCanvas",  type: "stage-advanced",       summary: "Moved to Final Decision",               offsetDays: -25 },
    { dealName: "RouteCanvas",  type: "ic-decision",          summary: "IC approved investment",                offsetDays: -23 },
    { dealName: "RouteCanvas",  type: "term-sheet-generated", summary: "Term sheet generated and sent",         offsetDays: -22 },
  ];
  await db.vCTimelineEvent.deleteMany({
    where: { tenantId, summary: { in: founderEvents.map((e) => e.summary) } },
  });
  for (const e of founderEvents) {
    const deal = dealByName[e.dealName];
    if (!deal) continue;
    await db.vCTimelineEvent.create({
      data: {
        tenantId,
        dealId: deal.id,
        type: e.type,
        actorId: analystId,
        summary: e.summary,
        visibility: "founder",
        createdAt: new Date(now.getTime() + e.offsetDays * dayMs),
      },
    });
  }
  console.log(`  ✓ ${founderEvents.length} founder-visible timeline events`);

  // ─── Reassign applications across founder1 / founder2 ──────────────────
  // The base seed maps userIds[role] = lastUser, so all applications end up
  // tied to founder2. Re-spread so founder1@example.test also has a deal
  // visible on their dashboard (PaystarRails + RouteCanvas).
  console.log("→ Reassigning applications across founders");
  const paystarApp = await db.vCApplication.findFirst({
    where: { tenantId, startupName: "PaystarRails" },
    select: { id: true },
  });
  const routeApp = await db.vCApplication.findFirst({
    where: { tenantId, startupName: "RouteCanvas" },
    select: { id: true },
  });
  if (paystarApp) {
    await db.vCApplication.update({
      where: { id: paystarApp.id },
      data: { founderId: founderId, contactEmail: "founder1@example.test" },
    });
  }
  if (routeApp) {
    await db.vCApplication.update({
      where: { id: routeApp.id },
      data: { founderId: founderId, contactEmail: "founder1@example.test" },
    });
  }
  console.log(`  ✓ founder1 now owns PaystarRails + RouteCanvas applications`);

  // ─── 18. Missing-doc placeholders for founder "Pending actions" ─────────
  console.log("→ Pending document slots");
  const paystar = dealByName["PaystarRails"];
  if (paystar) {
    const pending = ["bank-statements", "incorporation-cert"];
    for (const cat of pending) {
      const docId = `seed-doc-pending-${paystar.id}-${cat}`;
      await db.vCDealDocument.upsert({
        where: { id: docId },
        update: { status: "missing" },
        create: {
          id: docId,
          tenantId,
          dealId: paystar.id,
          category: cat,
          filename: `${cat}-pending.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 0,
          blobUrl: "",
          status: "missing",
          uploadedById: analystId,
        },
      });
    }
    console.log(`  ✓ 2 missing-doc slots on PaystarRails (founder sees as "pending uploads")`);
  }

  console.log("\n🎉 QuikVC demo data complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
