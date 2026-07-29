#!/usr/bin/env node
/**
 * End-to-end seed for QuikInfra — Finance, HRMS, Safety, Quality,
 * Approvals, Documents (stub), Expenses, Notes. Runs AFTER:
 *   1. seed-oauth.ts
 *   2. seed-quikinfra.mjs (base tenant + users + companies + vendors)
 *   3. seed-quikinfra-procurement.mjs (PR/PO/GRN/Stock)
 *
 * Idempotent — safe to run repeatedly.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user@localhost:5432/quikscale_dev \
 *     node scripts/seed-quikinfra-full.mjs
 */
import { PrismaClient } from "@prisma/client";

const DB_URL = process.env.DATABASE_URL ?? "postgresql://user@localhost:5432/quikscale_dev";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const TENANT_SLUG = "quikinfra-demo";

async function main() {
  console.log("→ Full seed for QuikInfra (Phases 5–14)…");

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG }, select: { id: true } });
  if (!tenant) throw new Error("Tenant not found. Run seed-quikinfra.mjs first.");
  const tenantId = tenant.id;

  const user = await prisma.cnCompany.findFirst({ where: { tenantId } });
  const adminUser = await prisma.user.findFirst({ where: { email: "amit@quikinfra.com" }, select: { id: true } });
  const memberUser = await prisma.user.findFirst({ where: { email: "priya@quikinfra.com" }, select: { id: true } });
  if (!adminUser || !memberUser) throw new Error("Demo users missing. Run seed-quikinfra.mjs first.");

  const adminId = adminUser.id;
  const memberId = memberUser.id;

  // ── Customers ──────────────────────────────────────────────────────
  console.log("  · customers");
  const customers = await Promise.all([
    { code: "CUST-001", name: "Mumbai Metropolitan Regional Development Authority", gstin: "27AAACM4476H1ZX", city: "Mumbai", state: "Maharashtra" },
    { code: "CUST-002", name: "Pune Infrastructure Pvt Ltd", gstin: "27AAACP2345F1Z3", city: "Pune", state: "Maharashtra" },
  ].map(c => prisma.cnCustomer.upsert({
    where: { tenantId_code: { tenantId, code: c.code } },
    create: { tenantId, ...c, status: "active", createdBy: adminId },
    update: {},
  })));

  // ── Projects — link customers ──────────────────────────────────────
  console.log("  · projects");
  const projectsPre = await prisma.cnProject.findMany({ where: { tenantId, deletedAt: null }, take: 2 });
  if (projectsPre[0]) {
    await prisma.cnProject.update({ where: { id: projectsPre[0].id }, data: { clientId: customers[0].id, projectValue: 50000000 } });
  }
  if (projectsPre[1]) {
    await prisma.cnProject.update({ where: { id: projectsPre[1].id }, data: { clientId: customers[1].id, projectValue: 25000000 } });
  }
  // refetch with updated clientId
  const projects = await prisma.cnProject.findMany({ where: { tenantId, deletedAt: null }, take: 2 });

  // ── Departments + Employees ────────────────────────────────────────
  console.log("  · departments + employees");
  const dept = await prisma.cnDepartment.upsert({
    where: { tenantId_code: { tenantId, code: "ENG" } },
    create: { tenantId, code: "ENG", name: "Engineering", status: "active", createdBy: adminId },
    update: {},
  });
  const employees = await Promise.all([
    { empCode: "EMP-001", firstName: "Vikram", lastName: "Rao",       designation: "Site Engineer",     empType: "permanent",  monthlyWage: 60000 },
    { empCode: "EMP-002", firstName: "Neha",   lastName: "Sharma",    designation: "Quantity Surveyor", empType: "permanent",  monthlyWage: 55000 },
    { empCode: "EMP-003", firstName: "Ramesh", lastName: "Kumar",     designation: "Mason",             empType: "daily_wage", dailyWage: 800    },
    { empCode: "EMP-004", firstName: "Suresh", lastName: "Yadav",     designation: "Carpenter",         empType: "daily_wage", dailyWage: 900    },
    { empCode: "EMP-005", firstName: "Sita",   lastName: "Devi",      designation: "Helper",            empType: "daily_wage", dailyWage: 500    },
  ].map(e => prisma.cnEmployee.upsert({
    where: { tenantId_empCode: { tenantId, empCode: e.empCode } },
    create: { tenantId, departmentId: dept.id, status: "active", email: null, joinDate: new Date("2024-06-01"), createdBy: adminId, ...e },
    update: {},
  })));

  // ── Attendance — last 20 days for daily-wage workers ──────────────
  console.log("  · attendance");
  const dailyEmps = employees.filter(e => e.empType === "daily_wage");
  const permEmps = employees.filter(e => e.empType === "permanent");
  const today = new Date();
  for (let d = 0; d < 20; d++) {
    const date = new Date(today); date.setDate(today.getDate() - d);
    date.setHours(0, 0, 0, 0);
    const projId = projects[d % projects.length]?.id;
    for (const emp of [...dailyEmps, ...permEmps]) {
      await prisma.cnAttendance.upsert({
        where: { tenantId_employeeId_date: { tenantId, employeeId: emp.id, date } },
        create: { tenantId, employeeId: emp.id, projectId: projId ?? null, date, status: "P", hoursWorked: 8, createdBy: adminId },
        update: {},
      });
    }
  }

  // ── BOQ (create minimal seed if none exists) ───────────────────────
  console.log("  · BOQ (seed if missing)");
  let seedBoq = await prisma.cnBOQ.findFirst({ where: { tenantId, boqNumber: "BOQ-SEED-001" } });
  if (!seedBoq && projects[0]) {
    const uom = await prisma.cnUOM.findFirst({ where: { tenantId } });
    const item = await prisma.cnItem.findFirst({ where: { tenantId } });
    if (uom && item) {
      seedBoq = await prisma.cnBOQ.create({
        data: {
          tenantId, boqNumber: "BOQ-SEED-001", projectId: projects[0].id,
          boqDate: new Date(), currency: "INR",
          subtotal: 1000000, taxAmount: 180000, total: 1180000,
          status: "locked", lockedAt: new Date(), lockedBy: adminId, createdBy: adminId,
          items: { create: [
            { kind: "item", code: "A1", description: "Excavation — earthwork",         itemId: item.id, uomId: uom.id, quantity: 500, rate: 600,  amount: 300000, gstRate: 18, sortOrder: 0 },
            { kind: "item", code: "A2", description: "PCC 1:3:6 foundation",           itemId: item.id, uomId: uom.id, quantity: 100, rate: 4500, amount: 450000, gstRate: 18, sortOrder: 1 },
            { kind: "item", code: "A3", description: "RCC M25 footing",                itemId: item.id, uomId: uom.id, quantity: 50,  rate: 5000, amount: 250000, gstRate: 18, sortOrder: 2 },
          ] },
        },
      });
    }
  }

  // ── RABs (if a locked BOQ exists) ───────────────────────────────────
  console.log("  · RABs");
  const lockedBoq = await prisma.cnBOQ.findFirst({ where: { tenantId, status: "locked" }, include: { items: { where: { kind: "item" }, take: 3 } } });
  let rab = null;
  if (lockedBoq && lockedBoq.items.length > 0 && projects[0]) {
    const existing = await prisma.cnRAB.findFirst({ where: { tenantId, projectId: projects[0].id, billSeqNo: 1 } });
    if (!existing) {
      const preparedLines = lockedBoq.items.map(it => {
        const q = Number(it.quantity ?? 0) * 0.3;
        const rate = Number(it.rate ?? 0);
        return { boqItemId: it.id, cumulativeQtyDone: q, priorCumulativeQty: 0, currentPeriodQty: q, rate, currentPeriodAmount: q * rate, gstRate: 18, taxAmount: q * rate * 0.18, remarks: null };
      });
      const current = preparedLines.reduce((s, l) => s + l.currentPeriodAmount, 0);
      const tax = preparedLines.reduce((s, l) => s + l.taxAmount, 0);
      rab = await prisma.cnRAB.create({
        data: {
          tenantId, projectId: projects[0].id, boqId: lockedBoq.id,
          rabNumber: `RAB-SEED-001`, rabDate: new Date(), billedTillDate: new Date(),
          billSeqNo: 1, priorBilledAmount: 0, currentBillAmount: current,
          subtotal: current, taxAmount: tax, total: current + tax,
          status: "approved", approvedAt: new Date(), approvedBy: adminId,
          createdBy: adminId,
          lines: { create: preparedLines },
        },
      });
    } else {
      rab = existing;
    }
  }

  // ── Invoices from RAB + standalone ─────────────────────────────────
  console.log("  · invoices");
  if (rab && rab.status === "approved" && projects[0]?.clientId) {
    const invExists = await prisma.cnClientInvoice.findFirst({ where: { tenantId, rabId: rab.id } });
    if (!invExists) {
      await prisma.cnClientInvoice.create({
        data: {
          tenantId, invoiceNumber: "INV-SEED-001",
          customerId: projects[0].clientId,
          projectId: projects[0].id,
          rabId: rab.id,
          invoiceDate: new Date(), dueDate: new Date(Date.now() + 15 * 86400000),
          subtotal: rab.subtotal, taxAmount: rab.taxAmount, total: rab.total,
          cgstAmount: 0, sgstAmount: 0, igstAmount: Number(rab.taxAmount),
          placeOfSupply: "27",
          status: "sent", paidAmount: 0,
          createdBy: adminId,
        },
      });
    }
  }

  // Standalone invoice with line items
  if (projects[1]?.clientId) {
    const inv2Exists = await prisma.cnClientInvoice.findFirst({ where: { tenantId, invoiceNumber: "INV-SEED-002" } });
    if (!inv2Exists) {
      await prisma.cnClientInvoice.create({
        data: {
          tenantId, invoiceNumber: "INV-SEED-002",
          customerId: projects[1].clientId,
          projectId: projects[1].id,
          invoiceDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
          subtotal: 500000, taxAmount: 90000, total: 590000,
          cgstAmount: 45000, sgstAmount: 45000, igstAmount: 0, placeOfSupply: "27",
          status: "sent", paidAmount: 0, createdBy: adminId,
          lines: { create: [
            { sortOrder: 0, description: "Mobilization advance billing", quantity: 1, rate: 500000, amount: 500000, gstRate: 18, taxAmount: 90000 },
          ] },
        },
      });
    }
  }

  // ── Vendor bills (from any posted GRN) ─────────────────────────────
  console.log("  · vendor bills");
  const postedGrn = await prisma.cnGoodsReceiptNote.findFirst({ where: { tenantId, status: "posted" }, include: { lines: true } });
  if (postedGrn) {
    const billExists = await prisma.cnVendorBill.findFirst({ where: { tenantId, grnId: postedGrn.id } });
    if (!billExists) {
      const subtotal = postedGrn.lines.reduce((s, l) => s + Number(l.amount), 0);
      await prisma.cnVendorBill.create({
        data: {
          tenantId, billNumber: "BILL-SEED-001",
          vendorId: postedGrn.vendorId, projectId: postedGrn.projectId,
          grnId: postedGrn.id, poId: postedGrn.poId,
          supplierInvoiceNo: "SUP-INV-" + Date.now().toString().slice(-4),
          billDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
          subtotal, taxAmount: 0, total: subtotal,
          cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
          status: "approved", paidAmount: 0,
          createdBy: adminId,
        },
      });
    }
  }

  // ── Expenses ────────────────────────────────────────────────────────
  console.log("  · expenses");
  for (const x of [
    { expenseNumber: "EXP-SEED-001", projectId: projects[0]?.id ?? null, category: "site_utility", description: "Diesel for generator", amount: 5000, paymentMode: "cash" },
    { expenseNumber: "EXP-SEED-002", projectId: projects[1]?.id ?? null, category: "travel",       description: "Site visit transport", amount: 2500, paymentMode: "upi" },
    { expenseNumber: "EXP-SEED-003", projectId: projects[0]?.id ?? null, category: "labour_cash",  description: "Daily wage settlement", amount: 12000, paymentMode: "cash" },
  ]) {
    await prisma.cnExpense.upsert({
      where: { tenantId_expenseNumber: { tenantId, expenseNumber: x.expenseNumber } },
      create: { tenantId, expenseDate: new Date(), status: "recorded", createdBy: adminId, ...x },
      update: {},
    });
  }

  // ── Approval rules ─────────────────────────────────────────────────
  console.log("  · approval rules");
  for (const r of [
    { name: "PO above ₹5L → admin approves", docType: "po",          minAmount: 500000, approverId: adminId },
    { name: "RAB above ₹10L → admin approves", docType: "rab",       minAmount: 1000000, approverId: adminId },
    { name: "Vendor bill always → accountant", docType: "vendor_bill", minAmount: null,  approverId: memberId },
  ]) {
    const existing = await prisma.cnApprovalRule.findFirst({ where: { tenantId, name: r.name, deletedAt: null } });
    if (!existing) {
      await prisma.cnApprovalRule.create({ data: { tenantId, status: "active", createdBy: adminId, ...r } });
    }
  }

  // ── Safety incidents ───────────────────────────────────────────────
  console.log("  · safety incidents");
  for (const i of [
    { incidentNumber: "INC-SEED-001", category: "near_miss", severity: "low",    title: "Loose scaffolding board spotted", projectId: projects[0]?.id ?? null },
    { incidentNumber: "INC-SEED-002", category: "injury",    severity: "medium", title: "Minor cut while handling rebar",  projectId: projects[0]?.id ?? null },
  ]) {
    await prisma.cnSafetyIncident.upsert({
      where: { tenantId_incidentNumber: { tenantId, incidentNumber: i.incidentNumber } },
      create: { tenantId, incidentDate: new Date(), status: "open", reportedBy: memberId, createdBy: memberId, ...i },
      update: {},
    });
  }

  // ── QC inspections (from posted GRN) ───────────────────────────────
  console.log("  · QC inspections");
  if (postedGrn) {
    const qcExists = await prisma.cnQCInspection.findFirst({ where: { tenantId, inspectionNumber: "QC-SEED-001" } });
    if (!qcExists) {
      await prisma.cnQCInspection.create({
        data: {
          tenantId, inspectionNumber: "QC-SEED-001",
          grnId: postedGrn.id, projectId: postedGrn.projectId,
          inspectorId: memberId, inspectionDate: new Date(),
          decision: "accepted", createdBy: memberId,
          defects: { create: [{ defectType: "minor paint scratch", severity: "minor" }] },
        },
      });
    }
  }

  console.log("✓ Full seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
