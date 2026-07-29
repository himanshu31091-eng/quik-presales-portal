#!/usr/bin/env node
/**
 * Migrate legacy MongoDB LCNC "GOAL" dump for org_691d68de6d2dc48a6ed47674 (MoreYeahs)
 * → local QuikScale Prisma DB (postgresql://user@localhost:5432/quikscale_dev)
 *
 * Scope: creates ONE tenant "Moreyeahs" + all users + teams + quarters + KPIs
 * + priorities + WWWs. All users get password "password123" (bcrypt cost 10).
 *
 * Run:
 *   DATABASE_URL="postgresql://user@localhost:5432/quikscale_dev" \
 *     node scripts/migrate-legacy/migrate-moreyeahs.mjs
 *
 * Idempotency: uses upserts for users (email unique) + membership. Re-running
 * should be safe. KPIs/Priorities/WWW get duplicated on re-run; wipe before
 * re-running (or delete by tenantId).
 */

import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const SRC = "/Users/user/Documents/dump/extracted/org_691d68de6d2dc48a6ed47674";
// LCNC platform dump (login-user table) — supplies createdBy/updatedBy ObjectIds
// that reference LCNC user logins, not the business-entity People docs.
const LCNC_USERS_BSON = "/tmp/lcnc-users/lcnc-GoalsLive/users.bson";
const MY_ORG_ID = "691d68de6d2dc48a6ed47674";
const BSONDUMP = "/opt/homebrew/bin/bsondump";

const DB_URL = process.env.DATABASE_URL ?? "postgresql://user@localhost:5432/quikscale_dev";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

// Entity IDs specific to this MoreYeahs dump
const ENT = {
  people:   "691d68e36d2dc48a6ed4767c",
  teams:    "691d68e36d2dc48a6ed4767f",
  quarter:  "691d68e36d2dc48a6ed47683",
  indKpi:   "691d68e36d2dc48a6ed47681",
  teamKpi:  "691d68e36d2dc48a6ed47682",
  priority: "691d68e36d2dc48a6ed47684",
  www:      "691d68e36d2dc48a6ed4767e",
};

/* ─── helpers ─────────────────────────────────────────────────────── */

function readBson(path) {
  const { stdout, status, stderr } = spawnSync(BSONDUMP, [path], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (status !== 0) throw new Error(`bsondump failed on ${path}: ${stderr}`);
  return stdout.trim().split("\n").filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { throw new Error(`bson line ${i} unparseable: ${line.slice(0, 100)}`); }
  });
}

const getFd = (r) => (Array.isArray(r.form_data) ? r.form_data[0] : r.form_data) || {};

const getNum = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
  if (v.$numberInt   !== undefined) return parseInt(v.$numberInt, 10);
  if (v.$numberDouble !== undefined) return parseFloat(v.$numberDouble);
  if (v.$numberLong  !== undefined) return parseInt(v.$numberLong, 10);
  return null;
};

const getLookupId = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v || null;
  if (Array.isArray(v)) return v[0] || null;
  if (typeof v === "object") {
    if (Array.isArray(v.id)) return v.id[0] || null;
    return v.id || null;
  }
  return null;
};

function yearForQuarter(q, startDate) {
  const d = new Date(startDate);
  const yy = d.getFullYear();
  const mm = d.getMonth() + 1;
  if (q === "Q1") return yy;
  // Q2-Q4: fiscal year is April–March. Jan-Mar of calendar year Y → FY Y-1.
  return mm >= 4 ? yy : yy - 1;
}

function slugify(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function parsePriorityWeek(s) {
  if (!s) return null;
  const m = String(s).match(/Week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseMDY(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

function normPriorityStatus(s) {
  const v = (s || "").toLowerCase().trim();
  if (!v) return null;
  if (v.includes("on track")) return "on-track";
  if (v.includes("completed")) return "completed";
  if (v.includes("behind")) return "behind-schedule";
  if (v.includes("not applicable")) return "not-applicable";
  if (v.includes("not yet") || v.includes("not started")) return "not-yet-started";
  return "not-yet-started";
}

function notesToText(n) {
  if (n == null) return null;
  if (typeof n === "string") return n.trim() || null;
  if (Array.isArray(n)) {
    const parts = n
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const ts = x.timestamp ? ` (${String(x.timestamp).slice(0, 10)})` : "";
          return x.value ? `${x.value}${ts}` : "";
        }
        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  }
  if (typeof n === "object") {
    if (n.value) return String(n.value);
    return null;
  }
  return null;
}

function normWWWStatus(s) {
  const v = (s || "").toLowerCase().trim();
  if (v.includes("complet")) return "completed";
  if (v.includes("progress")) return "in-progress";
  if (v.includes("behind")) return "behind-schedule";
  if (v.includes("not applicable")) return "not-applicable";
  if (v.includes("blocked")) return "blocked";
  if (v.includes("not yet") || v.includes("not started")) return "not-yet-started";
  return "not-yet-started";
}

/* ─── tier1 / tier2 metadata helpers ──────────────────────────────── */

// Unwrap Mongo `{$oid: "..."}` (or plain string) to string
const oidStr = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return v || null;
  if (typeof v === "object" && v.$oid) return v.$oid;
  return null;
};

// Unwrap Mongo `{$date: {$numberLong: "ms"}}` / `{$date: iso}` / ISO string / Date → Date|null
const mongoDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  if (typeof v === "object") {
    if (v.$date?.$numberLong) return new Date(parseInt(v.$date.$numberLong, 10));
    if (v.$date) return new Date(v.$date);
  }
  return null;
};

// Flatten Priority top-level `notes` ([{text,createdAt,createdBy}]) into one string
function flattenRecordNotes(arr, nameById) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const parts = arr
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const text = n.text || n.value;
      if (!text) return null;
      const dt = mongoDate(n.createdAt);
      const author = nameById(oidStr(n.createdBy));
      const tag = [dt && dt.toISOString().slice(0, 10), author].filter(Boolean).join(" — ");
      return tag ? `[${tag}] ${text}` : String(text);
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

/* ─── main ────────────────────────────────────────────────────────── */

async function main() {
  console.log("→ reading BSON sources…");
  const people     = readBson(`${SRC}/formData_${ENT.people}.bson`);
  const teams      = readBson(`${SRC}/formData_${ENT.teams}.bson`);
  const quarters   = readBson(`${SRC}/formData_${ENT.quarter}.bson`);
  const indKpis    = readBson(`${SRC}/formData_${ENT.indKpi}.bson`);
  const teamKpis   = readBson(`${SRC}/formData_${ENT.teamKpi}.bson`);
  const priorities = readBson(`${SRC}/formData_${ENT.priority}.bson`);
  const wwws       = readBson(`${SRC}/formData_${ENT.www}.bson`);
  const lcncUsers  = readBson(LCNC_USERS_BSON);
  console.log(`  people=${people.length}, teams=${teams.length}, quarters=${quarters.length}, indKpis=${indKpis.length}, teamKpis=${teamKpis.length}, priorities=${priorities.length}, wwws=${wwws.length}`);

  // Build people lookup
  const peopleById = new Map();
  for (const row of people) {
    const fd = getFd(row);
    const email = (fd["app-master-user-email"] || "").trim().toLowerCase();
    if (!email) continue;
    const fullName = (fd["app-master-user-name"] || "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    peopleById.set(row._id.$oid, {
      email,
      firstName: parts[0] || "User",
      lastName: parts.slice(1).join(" ") || "",
    });
  }

  // Build LCNC login-user lookup (ObjectId → email). Scopes to MoreYeahs org
  // but also keeps global super-admins (no org filter) in case they authored records.
  const lcncUserById = new Map();
  for (const u of lcncUsers) {
    const email = (u.email || "").trim().toLowerCase();
    if (!email) continue;
    const orgs = Array.isArray(u.organizations) ? u.organizations : [];
    const inOrg = orgs.some((o) => o?.orgId === MY_ORG_ID);
    if (!inOrg && !u.isSuperAdmin) continue;
    lcncUserById.set(u._id.$oid, email);
  }
  console.log(`  lcnc-users mapped: ${lcncUserById.size}`);

  // Build quarter lookup
  const quarterById = new Map();
  for (const row of quarters) {
    const fd = getFd(row);
    const q = fd["goal-quarter-select-1"];
    const start = fd["goal-quarter-date"];
    if (!q || !start) continue;
    // Source status: "completed" | "upcoming" | undefined → map to: completed | upcoming | active
    const rawStatus = (fd["goal-quarter-status"] || "").toLowerCase().trim();
    const status = rawStatus === "completed" ? "completed" : rawStatus === "upcoming" ? "upcoming" : "active";
    quarterById.set(row._id.$oid, {
      year: yearForQuarter(q, start),
      quarter: q,
      startDate: new Date(start),
      endDate: fd["goal-quarter-text"] ? new Date(fd["goal-quarter-text"]) : null,
      status,
    });
  }

  /* ─── 1. Tenant ─── */
  console.log("\n→ creating Tenant 'Moreyeahs'…");
  const tenant = await prisma.tenant.upsert({
    where: { slug: "moreyeahs" },
    update: {},
    create: { name: "Moreyeahs", slug: "moreyeahs" },
  });
  console.log(`  tenant.id=${tenant.id}`);

  // Wipe previously-migrated data so re-runs are idempotent
  // (keeps Tenant, Users, Memberships, Teams, UserTeams, QuarterSettings — those upsert)
  console.log("\n→ wiping previous KPIs / Priorities / WWWs for tenant…");
  await prisma.kPIWeeklyValue.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.priorityWeeklyStatus.deleteMany({ where: { priority: { tenantId: tenant.id } } });
  await prisma.kPI.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.priority.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.wWWItem.deleteMany({ where: { tenantId: tenant.id } });
  // Wipe teams too so re-running doesn't accumulate duplicate team rows
  await prisma.userTeam.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.team.deleteMany({ where: { tenantId: tenant.id } });
  console.log("  wiped.");

  // Find or bootstrap the createdBy user (ashwin@moreyeahs is already local super admin)
  const bootstrapUser = await prisma.user.findFirst({ where: { email: { contains: "ashwin@moreyeahs" } } });
  if (!bootstrapUser) throw new Error("ashwin super-admin missing from local DB — cannot set createdBy references");
  const SYSTEM_USER_ID = bootstrapUser.id;

  /* ─── 2. Users + Memberships ─── */
  console.log("\n→ creating users + memberships…");
  const passwordHash = await bcrypt.hash("password123", 10);
  const usersByEmail = new Map();
  for (const [sourceId, p] of peopleById) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, firstName: p.firstName, lastName: p.lastName, password: passwordHash },
    });
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: {},
      create: { userId: user.id, tenantId: tenant.id, role: "member", status: "active" },
    });
    usersByEmail.set(p.email, user);
  }
  console.log(`  users from People: ${usersByEmail.size}`);

  // Also upsert LCNC login-users whose email wasn't in People (system admins, etc.)
  // so createdBy/updatedBy lookups resolve. They get a Membership too (role=member).
  let lcncOnlyAdded = 0;
  for (const lu of lcncUsers) {
    const email = (lu.email || "").trim().toLowerCase();
    if (!email || usersByEmail.has(email)) continue;
    const orgs = Array.isArray(lu.organizations) ? lu.organizations : [];
    const inOrg = orgs.some((o) => o?.orgId === MY_ORG_ID);
    if (!inOrg && !lu.isSuperAdmin) continue;
    const nameParts = (lu.name || email.split("@")[0]).trim().split(/\s+/).filter(Boolean);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName: nameParts[0] || "User",
        lastName: nameParts.slice(1).join(" ") || "",
        password: passwordHash,
      },
    });
    if (inOrg) {
      await prisma.membership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        update: {},
        create: { userId: user.id, tenantId: tenant.id, role: "member", status: "active" },
      });
    }
    usersByEmail.set(email, user);
    lcncOnlyAdded++;
  }
  console.log(`  users added from LCNC-only: ${lcncOnlyAdded}`);
  console.log(`  users total: ${usersByEmail.size}`);

  // Mongo-ObjectId → local user.id. Tries two routes:
  //   1) LCNC login-user ObjectId (how createdBy/updatedBy are actually stored)
  //   2) People business-entity ObjectId (fallback for records authored via People lookup)
  // If neither resolves, falls back to Ashwin (SYSTEM_USER_ID).
  // Also upserts missing LCNC-only users (who weren't in People) so authorship doesn't collapse.
  const resolveUser = (mongoIdLike) => {
    const id = oidStr(mongoIdLike);
    if (!id) return SYSTEM_USER_ID;
    const lcncEmail = lcncUserById.get(id);
    if (lcncEmail) {
      const u = usersByEmail.get(lcncEmail);
      if (u) return u.id;
    }
    const p = peopleById.get(id);
    if (p) return usersByEmail.get(p.email)?.id ?? SYSTEM_USER_ID;
    return SYSTEM_USER_ID;
  };
  // Mongo-ObjectId → display name (for priority notes threading)
  const nameById = (mongoId) => {
    const p = mongoId ? peopleById.get(mongoId) : null;
    return p ? (p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName) : null;
  };
  // Build record-level metadata payload: handles createdAt/createdBy/updatedBy/deletedAt from Mongo.
  // `opts.updatedByField` = include updatedBy in data (true on models that have the column).
  const metaFromRow = (row, opts = { updatedByField: true }) => {
    const cAt = mongoDate(row.createdAt);
    const uAt = mongoDate(row.updatedAt);
    const cBy = resolveUser(row.createdBy);
    const uBy = resolveUser(row.updatedBy);
    const dAt = row.isDeleted ? (uAt ?? cAt ?? new Date()) : null;
    const out = { createdBy: cBy };
    if (cAt) out.createdAt = cAt;
    if (dAt) out.deletedAt = dAt;
    if (opts.updatedByField) out.updatedBy = uBy;
    // Tier 2: pass updatedAt for post-create raw SQL fix (Prisma @updatedAt overrides it on insert)
    out.__updatedAt = uAt;
    return out;
  };
  // Strip internal __updatedAt + apply it via raw SQL after create (Prisma @updatedAt forces now() on insert)
  const applyUpdatedAt = async (table, id, uAt) => {
    if (!uAt) return;
    await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "updatedAt" = $1 WHERE id = $2`, uAt, id);
  };
  const splitMeta = (m) => {
    const { __updatedAt, ...rest } = m;
    return { data: rest, updatedAt: __updatedAt };
  };

  /* ─── 3. Quarter Settings ─── */
  console.log("\n→ creating QuarterSettings…");
  let qCreated = 0;
  for (const [sourceId, q] of quarterById) {
    await prisma.quarterSetting.upsert({
      where: { tenantId_fiscalYear_quarter: { tenantId: tenant.id, fiscalYear: q.year, quarter: q.quarter } },
      update: { status: q.status },
      create: {
        tenantId: tenant.id,
        fiscalYear: q.year,
        quarter: q.quarter,
        startDate: q.startDate,
        endDate: q.endDate ?? q.startDate,
        status: q.status,
        createdBy: SYSTEM_USER_ID,
      },
    }).then(() => qCreated++).catch(e => console.warn(`  quarter skip: ${(e.message || String(e)).slice(0,600)}`));
  }
  console.log(`  quarters=${qCreated}`);

  /* ─── 4. Teams + memberships ─── */
  console.log("\n→ creating Teams + UserTeams…");
  const teamsBySource = new Map();
  for (const row of teams) {
    const fd = getFd(row);
    const name = (fd["goal-teams-text"] || "").trim();
    if (!name) continue;

    const headSrcId = getLookupId(fd["goal-teams-lookup"]);
    const headP = headSrcId ? peopleById.get(headSrcId) : null;
    const headUser = headP ? usersByEmail.get(headP.email) : null;

    const slug = `${slugify(name)}-${row._id.$oid.slice(-6)}`;
    const meta = splitMeta(metaFromRow(row, { updatedByField: false })); // Team has no updatedBy column
    const team = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name,
        slug,
        headId: headUser?.id ?? null,
        color: "#0066cc",
        ...meta.data,
      },
    });
    await applyUpdatedAt("Team", team.id, meta.updatedAt);
    teamsBySource.set(row._id.$oid, team);

    // Members array
    const members = Array.isArray(fd["goal-teams-multiplelookup"]) ? fd["goal-teams-multiplelookup"] : [];
    for (const m of members) {
      const mSrcId = getLookupId(m) || (typeof m === "string" ? m : null);
      const mP = mSrcId ? peopleById.get(mSrcId) : null;
      const mU = mP ? usersByEmail.get(mP.email) : null;
      if (!mU) continue;
      await prisma.userTeam.upsert({
        where: { tenantId_userId_teamId: { tenantId: tenant.id, userId: mU.id, teamId: team.id } },
        update: {},
        create: { tenantId: tenant.id, userId: mU.id, teamId: team.id },
      });
      // Also set primary team on membership if unset
      await prisma.membership.update({
        where: { tenantId_userId: { tenantId: tenant.id, userId: mU.id } },
        data: { teamId: team.id },
      }).catch(() => {});
    }
  }
  console.log(`  teams=${teamsBySource.size}`);

  /* ─── 5. Individual KPIs ─── */
  console.log("\n→ creating Individual KPIs…");
  let kpiInserted = 0, kpiSkipped = 0;
  for (const row of indKpis) {
    const fd = getFd(row);
    const name = (fd["goal-individual_kpi-text"] || "").trim();
    if (!name) { kpiSkipped++; continue; }

    const ownerP = peopleById.get(getLookupId(fd["goal-individual_kpi-lookup"]));
    const ownerU = ownerP ? usersByEmail.get(ownerP.email) : null;
    if (!ownerU) { kpiSkipped++; continue; }

    const team = teamsBySource.get(getLookupId(fd["goal-individual_kpi-lookup-1"]));
    const quarterInfo = quarterById.get(getLookupId(fd["goal-individual_kpi-lookup-3"]));
    if (!quarterInfo) { kpiSkipped++; continue; }

    const rawUnit = (fd["goal-individual_kpi-select"] || "number").toLowerCase();
    const measurementUnit = rawUnit === "currency" ? "Currency" : rawUnit === "percentage" ? "Percentage" : "Number";
    const currency = measurementUnit === "Currency" ? (fd["goal-individual_kpi-currency"] || "USD").trim() : null;
    const target = getNum(fd["goal-individual_kpi-text-1"]);
    const divisionType = (fd["goal-individual_kpi-radio"] || "Cumulative").trim() === "Standalone" ? "Standalone" : "Cumulative";

    const weeks = fd["goal-individual_kpi-weeklyContributionTable"]?.weeks || [];
    const weeklyTargets = {};
    const weeklyValueRows = [];
    let qtdAchieved = 0;
    for (const w of weeks) {
      const wn = getNum(w.week);
      const tv = getNum(w.targetValue);
      const cv = getNum(w.currentValue);
      if (wn == null) continue;
      if (tv != null) weeklyTargets[String(wn)] = tv;
      if (cv != null && cv > 0) {
        qtdAchieved += cv;
        weeklyValueRows.push({
          weekNumber: wn,
          value: cv,
          notes: w.notes && w.notes !== "No notes available" ? String(w.notes) : null,
          userId: ownerU.id,
        });
      }
    }
    const progressPercent = target && target > 0 ? Math.min(100, (qtdAchieved / target) * 100) : 0;
    const healthStatus = progressPercent >= 80 ? "on-track" : progressPercent >= 50 ? "at-risk" : "behind";

    const meta = splitMeta(metaFromRow(row));
    const kpi = await prisma.kPI.create({
      data: {
        tenantId: tenant.id,
        name,
        description: fd["goal-individual_kpi-textarea"] || null,
        kpiLevel: "individual",
        owner: ownerU.id,
        teamId: team?.id ?? null,
        quarter: quarterInfo.quarter,
        year: quarterInfo.year,
        measurementUnit,
        currency,
        target,
        quarterlyGoal: target,
        qtdGoal: target,
        qtdAchieved,
        progressPercent,
        status: "active",
        healthStatus,
        divisionType,
        weeklyTargets: Object.keys(weeklyTargets).length ? weeklyTargets : null,
        ...meta.data,
      },
    });
    await applyUpdatedAt("KPI", kpi.id, meta.updatedAt);
    for (const wv of weeklyValueRows) {
      await prisma.kPIWeeklyValue.create({
        data: { kpiId: kpi.id, tenantId: tenant.id, createdBy: SYSTEM_USER_ID, ...wv },
      }).catch((e) => console.warn(`  weekly skip kpi=${kpi.id} w=${wv.weekNumber}: ${e.message.slice(0,600)}`));
    }
    kpiInserted++;
  }
  console.log(`  individual KPIs: inserted=${kpiInserted}, skipped=${kpiSkipped}`);

  /* ─── 6. Team KPIs ─── */
  console.log("\n→ creating Team KPIs…");
  let teamKpiInserted = 0, teamKpiSkipped = 0;
  for (const row of teamKpis) {
    const fd = getFd(row);
    const name = (fd["goal-team_kpi-text"] || "").trim();
    if (!name) { teamKpiSkipped++; continue; }

    const team = teamsBySource.get(getLookupId(fd["goal-team_kpi-lookup"]));
    const quarterInfo = quarterById.get(getLookupId(fd["goal-team_kpi-lookup-4"]));
    if (!team || !quarterInfo) { teamKpiSkipped++; continue; }

    // Primary owner (lead)
    const leadP = peopleById.get(getLookupId(fd["goal-team_kpi-lookup-2"]));
    const leadU = leadP ? usersByEmail.get(leadP.email) : null;

    // Multi-owner list
    const mcl = Array.isArray(fd["goal-team_kpi-multicascadingLookup"]) ? fd["goal-team_kpi-multicascadingLookup"] : [];
    const ownerUsers = [];
    if (leadU) ownerUsers.push(leadU);
    for (const m of mcl) {
      const id = getLookupId(m);
      const p = id ? peopleById.get(id) : null;
      const u = p ? usersByEmail.get(p.email) : null;
      if (u && !ownerUsers.find((x) => x.id === u.id)) ownerUsers.push(u);
    }
    if (ownerUsers.length === 0) { teamKpiSkipped++; continue; }

    const rawUnit = (fd["goal-team_kpi-select"] || "number").toLowerCase();
    const measurementUnit = rawUnit === "currency" ? "Currency" : rawUnit === "percentage" ? "Percentage" : "Number";
    const currency = measurementUnit === "Currency" ? (fd["goal-team_kpi-currency"] || "USD").trim() : null;
    const target = getNum(fd["goal-team_kpi-text-1"]);
    const divisionType = (fd["goal-team_kpi-radio"] || "Cumulative").trim() === "Standalone" ? "Standalone" : "Cumulative";

    // Equal-split contribution across owners. Schema: ownerIds: String[], ownerContributions: Json { userId: pct } (sum=100)
    const ownerIds = ownerUsers.map((u) => u.id);
    const share = Math.floor(100 / ownerUsers.length);
    const ownerContributions = {};
    ownerIds.forEach((id, i) => { ownerContributions[id] = i === 0 ? (100 - share * (ownerIds.length - 1)) : share; });

    // Weekly data
    const weeks = fd["goal-team_kpi-weeklyContributionTable"]?.weeks || [];
    const weeklyTargets = {};
    const weeklyValueRows = [];
    let qtdAchieved = 0;
    for (const w of weeks) {
      const wn = getNum(w.week);
      const tv = getNum(w.targetValue);
      const cv = getNum(w.currentValue);
      if (wn == null) continue;
      if (tv != null) weeklyTargets[String(wn)] = tv;
      if (cv != null && cv > 0) {
        qtdAchieved += cv;
        weeklyValueRows.push({
          weekNumber: wn,
          value: cv,
          notes: w.notes && w.notes !== "No notes available" ? String(w.notes) : null,
          userId: leadU?.id ?? ownerUsers[0].id,
        });
      }
    }
    const progressPercent = target && target > 0 ? Math.min(100, (qtdAchieved / target) * 100) : 0;
    const healthStatus = progressPercent >= 80 ? "on-track" : progressPercent >= 50 ? "at-risk" : "behind";

    const meta = splitMeta(metaFromRow(row));
    const kpi = await prisma.kPI.create({
      data: {
        tenantId: tenant.id,
        name,
        description: fd["goal-team_kpi-textarea"] || null,
        kpiLevel: "team",
        owner: leadU?.id ?? ownerUsers[0].id,
        ownerIds,
        ownerContributions,
        teamId: team.id,
        quarter: quarterInfo.quarter,
        year: quarterInfo.year,
        measurementUnit,
        currency,
        target,
        quarterlyGoal: target,
        qtdGoal: target,
        qtdAchieved,
        progressPercent,
        status: "active",
        healthStatus,
        divisionType,
        weeklyTargets: Object.keys(weeklyTargets).length ? weeklyTargets : null,
        ...meta.data,
      },
    });
    await applyUpdatedAt("KPI", kpi.id, meta.updatedAt);
    for (const wv of weeklyValueRows) {
      await prisma.kPIWeeklyValue.create({
        data: { kpiId: kpi.id, tenantId: tenant.id, createdBy: SYSTEM_USER_ID, ...wv },
      }).catch((e) => console.warn(`  tkpi-weekly skip kpi=${kpi.id} w=${wv.weekNumber}: ${e.message.slice(0,600)}`));
    }
    teamKpiInserted++;
  }
  console.log(`  team KPIs: inserted=${teamKpiInserted}, skipped=${teamKpiSkipped}`);

  /* ─── 7. Priorities ─── */
  console.log("\n→ creating Priorities…");
  let priInserted = 0, priSkipped = 0;
  for (const row of priorities) {
    const fd = getFd(row);
    const name = (fd["goal-priority-text"] || "").trim();
    if (!name) { priSkipped++; continue; }

    const ownerP = peopleById.get(getLookupId(fd["goal-priority-lookup-1"]));
    const ownerU = ownerP ? usersByEmail.get(ownerP.email) : null;
    if (!ownerU) { priSkipped++; continue; }

    const team = teamsBySource.get(getLookupId(fd["goal-priority-lookup"]));
    const quarterInfo = quarterById.get(getLookupId(fd["goal-priority-lookup-2"]));
    if (!quarterInfo) { priSkipped++; continue; }

    const startWeek = parsePriorityWeek(fd["goal-priority-text-1"]);
    const endWeek = parsePriorityWeek(fd["goal-priority-text-2"]);

    const weeks = fd["goal-priority-WeeksData"] || [];
    const weeklyStatuses = [];
    let lastStatus = "not-yet-started";
    for (const w of weeks) {
      const wn = getNum(w.week);
      if (wn == null) continue;
      const st = normPriorityStatus(w.updateStatus);
      if (st && w.updateStatus) {
        weeklyStatuses.push({ weekNumber: wn, status: st, notes: w.notes || null });
        lastStatus = st;
      }
    }
    const overallStatus = lastStatus === "completed" ? "completed" : lastStatus;

    const meta = splitMeta(metaFromRow(row));
    const recordNotes = flattenRecordNotes(row.notes, nameById);
    const pri = await prisma.priority.create({
      data: {
        tenantId: tenant.id,
        name,
        owner: ownerU.id,
        teamId: team?.id ?? null,
        quarter: quarterInfo.quarter,
        year: quarterInfo.year,
        startWeek,
        endWeek,
        overallStatus,
        notes: recordNotes,
        ...meta.data,
      },
    });
    await applyUpdatedAt("Priority", pri.id, meta.updatedAt);
    for (const ws of weeklyStatuses) {
      await prisma.priorityWeeklyStatus.create({
        data: { priorityId: pri.id, ...ws },
      }).catch((e) => console.warn(`  priority-week skip pri=${pri.id}: ${e.message.slice(0,600)}`));
    }
    priInserted++;
  }
  console.log(`  priorities: inserted=${priInserted}, skipped=${priSkipped}`);

  /* ─── 8. WWW ─── */
  console.log("\n→ creating WWW items…");
  let wwwInserted = 0, wwwSkipped = 0;
  for (const row of wwws) {
    const fd = getFd(row);
    const what = (fd["goal-www-textarea"] || "").trim();
    if (!what) { wwwSkipped++; continue; }

    const whoPersonId = getLookupId(fd["goal-www-lookup"]);
    const whoP = whoPersonId ? peopleById.get(whoPersonId) : null;
    const whoU = whoP ? usersByEmail.get(whoP.email) : null;
    if (!whoU) { wwwSkipped++; continue; }

    const whenDate = parseMDY(fd["goal-www-dateonly-1"]);
    if (!whenDate) { wwwSkipped++; continue; }
    const revisedDate = parseMDY(fd["goal-www-dateonly"]);
    const status = normWWWStatus(fd["goal-www-select"]);

    const meta = splitMeta(metaFromRow(row));
    // Merge form-data notes with top-level record notes (rare, but preserve either)
    const fdNotes = notesToText(fd["goal-www-notestextarea"]);
    const recordNotes = flattenRecordNotes(row.notes, nameById);
    const mergedNotes = [fdNotes, recordNotes].filter(Boolean).join("\n\n") || null;
    const www = await prisma.wWWItem.create({
      data: {
        tenantId: tenant.id,
        who: whoU.id,
        what,
        when: whenDate,
        originalDueDate: whenDate,
        revisedDates: revisedDate ? [revisedDate.toISOString()] : [],
        status,
        notes: mergedNotes,
        ...meta.data,
      },
    });
    await applyUpdatedAt("WWWItem", www.id, meta.updatedAt);
    wwwInserted++;
  }
  console.log(`  WWWs: inserted=${wwwInserted}, skipped=${wwwSkipped}`);

  /* ─── summary ─── */
  console.log(`
╔════════════════════════════════════════════╗
║  MoreYeahs migration — DONE                ║
╠════════════════════════════════════════════╣
║  Tenant:        ${tenant.name.padEnd(26)} ║
║  Users:         ${String(usersByEmail.size).padEnd(26)} ║
║  Quarters:      ${String(qCreated).padEnd(26)} ║
║  Teams:         ${String(teamsBySource.size).padEnd(26)} ║
║  Ind KPIs:      ${String(kpiInserted).padEnd(9)} (skipped ${String(kpiSkipped).padEnd(5)})    ║
║  Team KPIs:     ${String(teamKpiInserted).padEnd(9)} (skipped ${String(teamKpiSkipped).padEnd(5)})    ║
║  Priorities:    ${String(priInserted).padEnd(9)} (skipped ${String(priSkipped).padEnd(5)})    ║
║  WWWs:          ${String(wwwInserted).padEnd(9)} (skipped ${String(wwwSkipped).padEnd(5)})    ║
╚════════════════════════════════════════════╝

All users → password = "password123"
`);
}

main()
  .catch((e) => { console.error("\n✖ MIGRATION FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
