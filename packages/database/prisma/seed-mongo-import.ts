/**
 * seed-mongo-import.ts — migrate MoreYeahs Mongo dump → Neon Postgres.
 *
 * Source: BSON dump under MONGO_DUMP_DIR (default: /tmp/moreyeahs-dump/goals/).
 * Target: 3 MoreYeahs orgs (Partnership, Sales, MoreYeahs core) → 3 Tenants.
 *
 * Decisions locked (Q1.a, Q2.a, Q3.a, Q4, Q5, Q6, Q7, Q8.b, Q9.a):
 *   - Migrate ONLY the 3 orgs in TARGET_ORG_IDS
 *   - Reuse Mongo ObjectIds verbatim as Postgres IDs
 *   - Split user.name on first space; lastName='' fallback
 *   - Preserve bcrypt password hashes verbatim ($2b$10$ stays $2b$10$)
 *   - Derive tenant.fiscalYearStart from earliest Q1 start_date (fallback: 1)
 *   - KPI breakdownData → weeklyTargets Json + KPIWeeklyValue rows (where contribution>0)
 *   - Ignore lcnc-GoalsLive/* entirely
 *   - Idempotent: wipe these 3 tenants first, then write
 *
 * Usage:
 *   cd packages/database
 *   MONGO_DUMP_DIR=/tmp/moreyeahs-dump/goals \
 *   DATABASE_URL='postgresql://...' \
 *   npx tsx prisma/seed-mongo-import.ts --dry-run     # validation only
 *   npx tsx prisma/seed-mongo-import.ts --confirm     # real write
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────────

const TARGET_ORG_IDS = new Set([
  "686617ffa0f7e1a5fb869746", // Moreyeahs Partnership (28u, 10t, 121k, 98p)
  "6890876701ffd022efcb0a9f", // Moreyeahs Sales       (7u, 1t, 79k, 0p)
  "6836b35451fba75a76c4e405", // MoreYeahs (core)      (17u, 4t, 25k, 3p)
]);

const DUMP_DIR = process.env.MONGO_DUMP_DIR ?? "/tmp/moreyeahs-dump/goals";
const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRMED = process.argv.includes("--confirm");

// ── Mongo BSON loader ─────────────────────────────────────────────────────────

function loadBson<T>(name: string): T[] {
  const path = join(DUMP_DIR, `${name}.bson`);
  if (!existsSync(path)) throw new Error(`Dump file missing: ${path}`);
  const out = execSync(`bsondump --quiet "${path}"`, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return out
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as T);
}

function oid(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "$oid" in (v as Record<string, unknown>)) {
    return (v as { $oid: string }).$oid;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v !== null && "$date" in v) {
    const d = (v as { $date: { $numberLong: string } | string }).$date;
    if (typeof d === "string") return new Date(d);
    return new Date(Number(d.$numberLong));
  }
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isFinite(n) ? n : null;
  }
  if (v && typeof v === "object" && "$numberInt" in (v as Record<string, unknown>)) {
    return Number((v as { $numberInt: string }).$numberInt);
  }
  if (v && typeof v === "object" && "$numberDouble" in (v as Record<string, unknown>)) {
    return Number((v as { $numberDouble: string }).$numberDouble);
  }
  if (v && typeof v === "object" && "$numberLong" in (v as Record<string, unknown>)) {
    return Number((v as { $numberLong: string }).$numberLong);
  }
  return null;
}

// Mongo stores teamIds/assigneeIds as embedded snapshot objects: { id, name, _id }.
// And parentKpiId as { $oid: "..." }. Normalize all three to plain strings.
function unwrapId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string") return o.id;
    if (typeof o.$oid === "string") return o.$oid;
    if (o._id && typeof o._id === "object") {
      const inner = o._id as { $oid?: string };
      if (typeof inner.$oid === "string") return inner.$oid;
    }
  }
  return null;
}

function unwrapIds(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(unwrapId).filter((s): s is string => s !== null);
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = (full || "").trim();
  if (!trimmed) return { firstName: "Unknown", lastName: "" };
  const i = trimmed.indexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1).trim() };
}

function parseQuarterTag(tag: string): { quarter: string; year: number } | null {
  // Mongo stores e.g. "q2-2025" — normalize to ("Q2", 2025)
  const m = /^q([1-4])-(\d{4})$/i.exec((tag || "").trim());
  if (!m) return null;
  return { quarter: `Q${m[1]}`, year: Number(m[2]) };
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 80) || "untitled";
}

// ── Mongo doc shapes (loose — fields we touch) ────────────────────────────────

type MOrg = { _id: { $oid: string }; name?: string; createdAt?: unknown; updatedAt?: unknown };
type MUser = {
  _id: { $oid: string };
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  organizationIds?: string[];
  organizationRoles?: Array<{ organizationId: string; role: string }>;
  createdAt?: unknown;
  updatedAt?: unknown;
};
type MTeam = {
  _id: { $oid: string };
  name?: string;
  organizationId?: string;
  owner?: { id?: string };
  memberIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};
type MQuarter = {
  _id: { $oid: string };
  year?: string;
  quarter?: string;
  start_date?: string;
  end_date?: string;
  organizationId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};
type MBreakdown = {
  intervalIndex?: unknown;
  intervalName?: string;
  startDate?: string;
  endDate?: string;
  intervalContribution?: string;
  intervalTarget?: string;
};
type MKpi = {
  _id: { $oid: string };
  organizationId?: string;
  name?: string;
  description?: string;
  ownerId?: { id?: string; name?: string } | string;
  measurementUnit?: string;
  targetValue?: string;
  currentValue?: string;
  divisionType?: string;
  quarter?: string;
  contribution?: string;
  remainingContribution?: string;
  frequency?: string;
  parentKpiId?: unknown; // { $oid } | string | null
  kpiType?: string;
  breakdownData?: MBreakdown[];
  childKpis?: unknown[];
  teamIds?: unknown[]; // [{ id, name, _id }, ...]
  assigneeIds?: unknown[]; // [{ id, name, _id }, ...]
  currencyType?: string;
  initialCurrentValue?: string;
  initialTargetValue?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: unknown; // string | { $oid }
};
type MPriority = {
  _id: { $oid: string };
  organizationId?: string;
  name?: string;
  description?: string;
  owner?: { $oid: string } | string;
  team?: { $oid: string } | string;
  quarter?: string;
  startDate?: unknown;
  endDate?: unknown;
  startWeek?: { intervalIndex?: unknown };
  endWeek?: { intervalIndex?: unknown };
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: unknown;
};
type MPHist = {
  _id: { $oid: string };
  priorityId?: string;
  field?: string;
  previousValue?: string;
  updatedValue?: string;
  updatedBy?: string;
  createdAt?: unknown;
};

// ── Validation report ─────────────────────────────────────────────────────────

type Issue = { severity: "ERROR" | "WARN"; entity: string; id: string; reason: string };
const issues: Issue[] = [];
const error = (entity: string, id: string, reason: string) => issues.push({ severity: "ERROR", entity, id, reason });
const warn = (entity: string, id: string, reason: string) => issues.push({ severity: "WARN", entity, id, reason });

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!DRY_RUN && !CONFIRMED) {
    console.error("❌ Refusing to run. Pass --dry-run (validate only) or --confirm (actual write).");
    process.exit(1);
  }

  console.log("══════════════════════════════════════════════════════════════");
  console.log("  Mongo → Neon import: 3 MoreYeahs orgs");
  console.log(`  Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "WRITE"}`);
  console.log(`  Source: ${DUMP_DIR}`);
  console.log(`  Target DB: ${(process.env.DATABASE_URL ?? "").replace(/:[^:@]+@/, ":***@")}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  // ─── 1. LOAD ─────────────────────────────────────────────────────────────
  console.log("📥 Loading BSON…");
  const orgs = loadBson<MOrg>("organizations").filter(o => TARGET_ORG_IDS.has(o._id.$oid));
  const allUsers = loadBson<MUser>("users");
  const teams = loadBson<MTeam>("teams").filter(t => t.organizationId && TARGET_ORG_IDS.has(t.organizationId));
  const quarters = loadBson<MQuarter>("quarters").filter(q => q.organizationId && TARGET_ORG_IDS.has(q.organizationId));
  const kpis = loadBson<MKpi>("kpis").filter(k => k.organizationId && TARGET_ORG_IDS.has(k.organizationId));
  const prios = loadBson<MPriority>("priorities").filter(p => p.organizationId && TARGET_ORG_IDS.has(p.organizationId));
  const prioIds = new Set(prios.map(p => p._id.$oid));
  const phists = loadBson<MPHist>("priorityhistories").filter(h => h.priorityId && prioIds.has(h.priorityId));

  // Users: keep any user that belongs to ≥1 of our 3 orgs (organizationIds[] intersection)
  const users = allUsers.filter(u => (u.organizationIds ?? []).some(id => TARGET_ORG_IDS.has(id)));

  console.log(`  orgs:          ${orgs.length}  (expect 3)`);
  console.log(`  users:         ${users.length}  (intersected from ${allUsers.length})`);
  console.log(`  teams:         ${teams.length}`);
  console.log(`  quarters:      ${quarters.length}`);
  console.log(`  kpis:          ${kpis.length}`);
  console.log(`  priorities:    ${prios.length}`);
  console.log(`  priorityhists: ${phists.length}\n`);

  if (orgs.length !== 3) error("scope", "tenants", `Expected 3 orgs in scope, found ${orgs.length}`);

  // ─── 2. VALIDATE ─────────────────────────────────────────────────────────
  console.log("🔍 Validating FK integrity…");

  const userIds = new Set(users.map(u => u._id.$oid));
  const teamIds = new Set(teams.map(t => t._id.$oid));

  // Email collision check (multi-org users → 1 User row, dedupe by email)
  const emailCount = new Map<string, string[]>();
  for (const u of users) {
    if (!u.email) {
      error("user", u._id.$oid, "missing email");
      continue;
    }
    const arr = emailCount.get(u.email.toLowerCase()) ?? [];
    arr.push(u._id.$oid);
    emailCount.set(u.email.toLowerCase(), arr);
  }
  let dupEmails = 0;
  for (const [email, ids] of emailCount) {
    if (ids.length > 1) {
      dupEmails++;
      warn("user", email, `duplicate email across ${ids.length} user docs (keeping first: ${ids[0]})`);
    }
  }

  // KPI FK integrity (unwrap embedded snapshot objects to plain string IDs)
  for (const k of kpis) {
    const ownerId = typeof k.ownerId === "string" ? k.ownerId : k.ownerId?.id;
    if (ownerId && !userIds.has(ownerId)) warn("kpi", k._id.$oid, `ownerId '${ownerId}' not in user set`);
    const parentId = unwrapId(k.parentKpiId);
    if (parentId && !kpis.some(p => p._id.$oid === parentId))
      warn("kpi", k._id.$oid, `parentKpiId '${parentId}' not in scope`);
    for (const tid of unwrapIds(k.teamIds)) {
      if (!teamIds.has(tid)) warn("kpi", k._id.$oid, `teamId '${tid}' not in scope`);
    }
  }

  // Priority FK integrity
  for (const p of prios) {
    const ownerId = oid(p.owner) ?? (typeof p.owner === "string" ? p.owner : null);
    if (ownerId && !userIds.has(ownerId)) warn("priority", p._id.$oid, `owner '${ownerId}' not in user set`);
    const tid = oid(p.team) ?? (typeof p.team === "string" ? p.team : null);
    if (tid && !teamIds.has(tid)) warn("priority", p._id.$oid, `team '${tid}' not in scope`);
  }

  // Team owner / members
  for (const t of teams) {
    if (t.owner?.id && !userIds.has(t.owner.id)) warn("team", t._id.$oid, `owner '${t.owner.id}' not in user set`);
    for (const mid of t.memberIds ?? []) {
      if (!userIds.has(mid)) warn("team", t._id.$oid, `memberId '${mid}' not in user set`);
    }
  }

  const errCount = issues.filter(i => i.severity === "ERROR").length;
  const warnCount = issues.filter(i => i.severity === "WARN").length;
  console.log(`  ${errCount} errors, ${warnCount} warnings, ${dupEmails} duplicate-email dedups\n`);

  if (issues.length > 0) {
    console.log("─── Issues ───");
    for (const i of issues.slice(0, 50)) {
      console.log(`  [${i.severity}] ${i.entity} ${i.id}: ${i.reason}`);
    }
    if (issues.length > 50) console.log(`  … and ${issues.length - 50} more`);
    console.log();
  }

  if (errCount > 0) {
    console.error("❌ Validation failed (errors). Aborting.");
    process.exit(1);
  }

  // Per-tenant fiscal year derivation (earliest Q1 start month → fiscalYearStart)
  const fiscalYearByOrg = new Map<string, number>();
  for (const o of orgs) {
    const oid = o._id.$oid;
    const orgQs = quarters.filter(q => q.organizationId === oid && (q.quarter || "").toLowerCase() === "q1");
    let month = 1;
    if (orgQs.length > 0) {
      const sorted = orgQs
        .map(q => toDate(q.start_date))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      if (sorted[0]) month = sorted[0].getMonth() + 1;
    }
    fiscalYearByOrg.set(oid, month);
  }

  console.log("📅 Derived fiscal year start per tenant:");
  for (const [oid, m] of fiscalYearByOrg) {
    const o = orgs.find(x => x._id.$oid === oid);
    console.log(`  ${o?.name?.trim()} (${oid}) → fiscalYearStart=${m}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("✅ DRY-RUN complete. No DB writes performed.");
    console.log("   Re-run with --confirm to actually import.");
    return;
  }

  // ─── 3. WIPE existing rows for these 3 tenants (idempotent restart) ──────
  console.log("🧨 Wiping existing rows for the 3 target tenants + their Mongo-imported users…");
  const tenantIds = orgs.map(o => o._id.$oid);
  // Users we'll be importing (by Mongo ObjectId)
  const candidateUserIds = users.map(u => u._id.$oid);
  await prisma.$transaction(async tx => {
    // Cascade delete: deleting Tenant cascades to all tenant-scoped rows
    await tx.org.deleteMany({ where: { id: { in: tenantIds } } });
    // Also delete any leftover Users from previous import runs (Mongo IDs match)
    // — User isn't tenant-scoped, so the tenant wipe doesn't cascade to them.
    await tx.user.deleteMany({ where: { id: { in: candidateUserIds } } });
  });
  console.log(`  ✓ wiped ${tenantIds.length} tenants (CASCADE) + cleared ${candidateUserIds.length} candidate Mongo user IDs\n`);

  // ─── 4. WRITE in FK order ────────────────────────────────────────────────
  console.log("✍️  Writing data in FK order…");

  // 4a. Tenants
  for (const o of orgs) {
    const oid = o._id.$oid;
    const fys = fiscalYearByOrg.get(oid) ?? 1;
    await prisma.org.create({
      data: {
        id: oid,
        name: (o.name || "Untitled").trim(),
        // Append last 6 of ObjectId to guarantee uniqueness (multiple orgs share name "MoreYeahs")
        slug: `${slugify(o.name || oid)}-${oid.slice(-6)}`,
        fiscalYearStart: fys,
        quarterStartMonth: fys,
        weekStartDay: 1,
        brandColor: "#0066cc",
        plan: "scale",
        createdAt: toDate(o.createdAt) ?? new Date(),
        updatedAt: toDate(o.updatedAt) ?? new Date(),
      },
    });
  }
  console.log(`  ✓ ${orgs.length} tenants`);

  // 4b. Users (dedupe by both ID and email — Mongo dump has duplicate docs)
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  let userCreated = 0;
  for (const u of users) {
    if (!u.email) continue;
    if (seenIds.has(u._id.$oid)) continue;
    seenIds.add(u._id.$oid);
    const email = u.email.toLowerCase();
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    const { firstName, lastName } = splitName(u.name ?? "");
    await prisma.user.create({
      data: {
        id: u._id.$oid,
        email,
        password: u.password ?? null, // bcrypt hash preserved verbatim
        firstName,
        lastName,
        emailVerified: new Date(),
        isSuperAdmin: false,
        createdAt: toDate(u.createdAt) ?? new Date(),
        updatedAt: toDate(u.updatedAt) ?? new Date(),
      },
    });
    userCreated++;
  }
  console.log(`  ✓ ${userCreated} users (deduped from ${users.length})`);

  // 4c. Memberships (one per (user, org) intersection, role from organizationRoles)
  let memCreated = 0;
  for (const u of users) {
    if (!u.email) continue;
    const userIdReal = u._id.$oid;
    // Dedupe-by-email may have skipped this user — only create memberships for the kept user
    const kept = await prisma.user.findUnique({ where: { id: userIdReal } });
    if (!kept) continue;
    const rolesByOrg = new Map<string, string>();
    for (const r of u.organizationRoles ?? []) {
      if (TARGET_ORG_IDS.has(r.organizationId)) rolesByOrg.set(r.organizationId, r.role);
    }
    for (const orgId of u.organizationIds ?? []) {
      if (!TARGET_ORG_IDS.has(orgId)) continue;
      const mongoRole = rolesByOrg.get(orgId) ?? u.role ?? "member";
      // Map Mongo roles → QuikIT roles
      const role =
        mongoRole === "organization_owner" || mongoRole === "owner" || mongoRole === "admin" ? "admin"
        : mongoRole === "manager" ? "manager"
        : "employee";
      try {
        await prisma.orgMember.create({
          data: {
            tenantId: orgId,
            userId: userIdReal,
            role,
            status: "active",
            acceptedAt: toDate(u.createdAt) ?? new Date(),
          },
        });
        memCreated++;
      } catch {
        // Unique (tenantId, userId) — skip if exists (shouldn't happen post-wipe)
      }
    }
  }
  console.log(`  ✓ ${memCreated} memberships`);

  // 4d. Teams
  let teamCreated = 0;
  for (const t of teams) {
    if (!t.organizationId) continue;
    await prisma.team.create({
      data: {
        id: t._id.$oid,
        tenantId: t.organizationId,
        name: t.name ?? "Untitled Team",
        slug: slugify(t.name ?? t._id.$oid),
        headId: t.owner?.id && (await prisma.user.findUnique({ where: { id: t.owner.id } })) ? t.owner.id : null,
        createdAt: toDate(t.createdAt) ?? new Date(),
        updatedAt: toDate(t.updatedAt) ?? new Date(),
      },
    });
    teamCreated++;
  }
  console.log(`  ✓ ${teamCreated} teams`);

  // 4e. Quarters → QuarterSetting (Mongo q+year → Q1/2/3/4 + fiscalYear)
  let qCreated = 0;
  for (const q of quarters) {
    if (!q.organizationId) continue;
    const tag = parseQuarterTag(`${q.quarter}-${q.year}`);
    if (!tag) continue;
    const start = toDate(q.start_date);
    const end = toDate(q.end_date);
    if (!start || !end) continue;
    try {
      await prisma.quarterSetting.create({
        data: {
          id: q._id.$oid,
          tenantId: q.organizationId,
          fiscalYear: tag.year,
          quarter: tag.quarter,
          startDate: start,
          endDate: end,
          status: end < new Date() ? "completed" : start > new Date() ? "upcoming" : "active",
          createdBy: "mongo-import",
          createdAt: toDate(q.createdAt) ?? new Date(),
          updatedAt: toDate(q.updatedAt) ?? new Date(),
        },
      });
      qCreated++;
    } catch {
      // Unique (tenantId, fiscalYear, quarter) — skip duplicates from Mongo
    }
  }
  console.log(`  ✓ ${qCreated} quarter settings`);

  // 4f. KPIs + 4g. KPIWeeklyValues
  let kpiCreated = 0;
  let weeklyCreated = 0;
  for (const k of kpis) {
    if (!k.organizationId) continue;
    const tag = parseQuarterTag(k.quarter ?? "");
    if (!tag) continue;
    const ownerId =
      typeof k.ownerId === "string" ? k.ownerId
      : k.ownerId?.id ?? null;
    // owner is required (String) on KPI — fall back to created-by or first user in tenant
    const ownerSafe = ownerId && (await prisma.user.findUnique({ where: { id: ownerId } })) ? ownerId : null;
    if (!ownerSafe) {
      warn("kpi", k._id.$oid, "no resolvable owner — skipping");
      continue;
    }
    const teamIdsClean = unwrapIds(k.teamIds).filter(t => teamIds.has(t));
    const teamId = teamIdsClean[0] ?? null;
    const assigneeIdsClean = unwrapIds(k.assigneeIds).filter(u => userIds.has(u));
    const parentIdClean = unwrapId(k.parentKpiId);
    const targetVal = toNum(k.targetValue);
    const breakdown = (k.breakdownData ?? []).filter(b => toNum(b.intervalIndex) !== null);

    // weeklyTargets (Json): { weekNumber: targetValue }
    const weeklyTargets: Record<string, number> = {};
    for (const b of breakdown) {
      const wk = toNum(b.intervalIndex);
      const tgt = toNum(b.intervalTarget);
      if (wk !== null && tgt !== null) weeklyTargets[String(wk + 1)] = tgt;
    }

    await prisma.kPI.create({
      data: {
        id: k._id.$oid,
        tenantId: k.organizationId,
        name: k.name ?? "Untitled KPI",
        description: k.description ?? null,
        kpiLevel: k.kpiType === "team" ? "team" : "individual",
        owner: ownerSafe,
        ownerIds: assigneeIdsClean,
        teamId,
        // parentKPIId set in second pass below to avoid forward-reference FK errors
        parentKPIId: null,
        quarter: tag.quarter,
        year: tag.year,
        measurementUnit: k.measurementUnit ?? "Number",
        target: targetVal,
        quarterlyGoal: targetVal,
        qtdGoal: targetVal,
        qtdAchieved: toNum(k.currentValue),
        currentWeekValue: null,
        progressPercent: null,
        status: "active",
        healthStatus: "on-track",
        divisionType: k.divisionType === "standalone" ? "Standalone" : "Cumulative",
        weeklyTargets: weeklyTargets as Prisma.InputJsonValue,
        currency: k.currencyType ?? null,
        targetScale: null,
        reverseColor: false,
        frequency: (k.frequency ?? "weekly").toLowerCase(),
        createdAt: toDate(k.createdAt) ?? new Date(),
        updatedAt: toDate(k.updatedAt) ?? new Date(),
        createdBy: unwrapId(k.createdBy) ?? ownerSafe,
        updatedBy: null,
      },
    });
    kpiCreated++;

    // KPIWeeklyValue rows: only where intervalContribution > 0
    for (const b of breakdown) {
      const wk = toNum(b.intervalIndex);
      const ctr = toNum(b.intervalContribution);
      if (wk === null || ctr === null || ctr === 0) continue;
      try {
        await prisma.kPIWeeklyValue.create({
          data: {
            tenantId: k.organizationId,
            kpiId: k._id.$oid,
            userId: ownerSafe,
            weekNumber: wk + 1, // Mongo 0-indexed → QuikIT 1-indexed
            value: ctr,
            notes: null,
            createdBy: ownerSafe,
          },
        });
        weeklyCreated++;
      } catch {
        // unique (kpiId, userId, weekNumber) — skip
      }
    }
  }
  console.log(`  ✓ ${kpiCreated} KPIs (+ ${weeklyCreated} weekly values)`);

  // 4f-bis. Second pass: link parent KPIs (avoids forward-FK errors on first insert)
  const kpiIdsInserted = new Set((await prisma.kPI.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map(r => r.id));
  let parentLinks = 0;
  for (const k of kpis) {
    const parentIdClean = unwrapId(k.parentKpiId);
    if (parentIdClean && kpiIdsInserted.has(k._id.$oid) && kpiIdsInserted.has(parentIdClean)) {
      await prisma.kPI.update({
        where: { id: k._id.$oid },
        data: { parentKPIId: parentIdClean },
      });
      parentLinks++;
    }
  }
  console.log(`  ✓ ${parentLinks} KPI parent links`);

  // 4h. Priorities
  let prioCreated = 0;
  for (const p of prios) {
    if (!p.organizationId) continue;
    const tag = parseQuarterTag(p.quarter ?? "");
    if (!tag) continue;
    const ownerId = oid(p.owner) ?? (typeof p.owner === "string" ? p.owner : null);
    const ownerSafe = ownerId && (await prisma.user.findUnique({ where: { id: ownerId } })) ? ownerId : null;
    if (!ownerSafe) {
      warn("priority", p._id.$oid, "no resolvable owner — skipping");
      continue;
    }
    const teamId = oid(p.team) ?? (typeof p.team === "string" ? p.team : null);
    const teamSafe = teamId && teamIds.has(teamId) ? teamId : null;
    await prisma.priority.create({
      data: {
        id: p._id.$oid,
        tenantId: p.organizationId,
        name: p.name ?? "Untitled Priority",
        description: p.description ?? null,
        owner: ownerSafe,
        teamId: teamSafe,
        quarter: tag.quarter,
        year: tag.year,
        startWeek: toNum(p.startWeek?.intervalIndex),
        endWeek: toNum(p.endWeek?.intervalIndex),
        overallStatus: (p.status ?? "not-started").toLowerCase().replace(/\s+/g, "-"),
        createdAt: toDate(p.createdAt) ?? new Date(),
        updatedAt: toDate(p.updatedAt) ?? new Date(),
        createdBy: unwrapId(p.createdBy) ?? ownerSafe,
      },
    });
    prioCreated++;
  }
  console.log(`  ✓ ${prioCreated} priorities`);

  // 4i. PriorityHistory → AuditLog
  let auditCreated = 0;
  for (const h of phists) {
    if (!h.priorityId) continue;
    const prio = prios.find(p => p._id.$oid === h.priorityId);
    if (!prio?.organizationId) continue;
    await prisma.auditLog.create({
      data: {
        tenantId: prio.organizationId,
        action: "UPDATE",
        entityType: "Priority",
        entityId: h.priorityId,
        oldValues: JSON.stringify({ [h.field ?? "?"]: h.previousValue }),
        newValues: JSON.stringify({ [h.field ?? "?"]: h.updatedValue }),
        changes: [h.field ?? "?"],
        actorId: h.updatedBy === "system" ? "system" : (h.updatedBy ?? "system"),
        actorRole: null,
        reason: "Migrated from Mongo priorityhistories",
        createdAt: toDate(h.createdAt) ?? new Date(),
      },
    });
    auditCreated++;
  }
  console.log(`  ✓ ${auditCreated} audit logs (priority history)`);

  // ─── 5. SUMMARY ──────────────────────────────────────────────────────────
  const [tn, un, mn, te, qs, kn, kw, pn, an] = await Promise.all([
    prisma.org.count({ where: { id: { in: tenantIds } } }),
    prisma.user.count({ where: { memberships: { some: { tenantId: { in: tenantIds } } } } }),
    prisma.orgMember.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.team.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.quarterSetting.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.kPI.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.kPIWeeklyValue.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.priority.count({ where: { tenantId: { in: tenantIds } } }),
    prisma.auditLog.count({ where: { tenantId: { in: tenantIds } } }),
  ]);

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ✅ Import complete. Final counts:");
  console.log("══════════════════════════════════════════════════════════════");
  console.log(`  Tenants:          ${tn}     (expect 3)`);
  console.log(`  Users (in scope): ${un}`);
  console.log(`  Memberships:      ${mn}`);
  console.log(`  Teams:            ${te}`);
  console.log(`  Quarter settings: ${qs}`);
  console.log(`  KPIs:             ${kn}`);
  console.log(`  KPI weekly vals:  ${kw}`);
  console.log(`  Priorities:       ${pn}`);
  console.log(`  Audit logs:       ${an}`);
  if (warnCount > 0) console.log(`\n  ⚠️  ${warnCount} warnings during validation — see above`);
}

main()
  .catch(e => {
    console.error("❌ FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
