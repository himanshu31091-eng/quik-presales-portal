#!/usr/bin/env node
/**
 * Seeds a sample P2P flow into the "QuikInfra Demo" tenant:
 *   1. Ensure UOM + Item Group + Item
 *   2. Ensure Project + Location
 *   3. Create PR (draft) → Submit
 *   4. Create PO from PR → Send
 *   5. Create GRN against PO → Post (writes stock ledger)
 *   6. Create Material Issue → Post (decrements stock)
 *
 * Run locally after `npx tsx packages/database/prisma/seed-oauth.ts`
 *     and  `node scripts/seed-quikinfra.mjs`:
 *
 *   DATABASE_URL=... node scripts/seed-quikinfra-procurement.mjs
 */
import { PrismaClient } from "@prisma/client";

const DB_URL = process.env.DATABASE_URL ?? "postgresql://user@localhost:5432/quikscale_dev";
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "quikinfra-demo" } });
  if (!tenant) throw new Error("Run scripts/seed-quikinfra.mjs first.");
  const bootstrap = await prisma.user.findFirst({ where: { email: "amit@quikinfra.com" } });
  if (!bootstrap) throw new Error("Demo user amit@quikinfra.com missing.");
  const tenantId = tenant.id;
  const createdBy = bootstrap.id;

  console.log("→ Seeding P2P flow into tenant", tenant.name);

  // ── Masters backfill ──────────────────────────────────────────────
  const bag = await prisma.cnUOM.upsert({
    where: { tenantId_code: { tenantId, code: "BAG" } },
    update: {},
    create: { tenantId, code: "BAG", name: "Bag", createdBy },
  });
  const nos = await prisma.cnUOM.upsert({
    where: { tenantId_code: { tenantId, code: "NOS" } },
    update: {},
    create: { tenantId, code: "NOS", name: "Numbers", createdBy },
  });

  const existingGroups = await prisma.cnItemGroup.findMany({
    where: { tenantId, name: { in: ["Cement & Binding", "Steel"] } },
  });
  let cementGroup = existingGroups.find((g) => g.name === "Cement & Binding");
  if (!cementGroup) {
    cementGroup = await prisma.cnItemGroup.create({
      data: { tenantId, name: "Cement & Binding", sortOrder: 1, createdBy },
    });
  }
  let steelGroup = existingGroups.find((g) => g.name === "Steel");
  if (!steelGroup) {
    steelGroup = await prisma.cnItemGroup.create({
      data: { tenantId, name: "Steel", sortOrder: 2, createdBy },
    });
  }

  const cement = await prisma.cnItem.upsert({
    where: { tenantId_code: { tenantId, code: "CEM-OPC53" } },
    update: {},
    create: {
      tenantId, code: "CEM-OPC53", name: "OPC 53-grade cement",
      groupId: cementGroup.id, uomId: bag.id,
      standardRate: 420, gstRate: 18, createdBy,
    },
  });
  const tmt = await prisma.cnItem.upsert({
    where: { tenantId_code: { tenantId, code: "STL-TMT12" } },
    update: {},
    create: {
      tenantId, code: "STL-TMT12", name: "TMT bar 12mm Fe-500",
      groupId: steelGroup.id, uomId: nos.id,
      standardRate: 58000, gstRate: 18, createdBy,
    },
  });

  // ── Company + Project + Vendor + Location ─────────────────────────
  const company = await prisma.cnCompany.findFirst({ where: { tenantId, name: "QuikInfra Builders" } })
    ?? (await prisma.cnCompany.create({
        data: {
          tenantId, name: "QuikInfra Builders", legalName: "QuikInfra Builders Pvt. Ltd.",
          gstin: "27AAACQ1234A1Z5", pan: "AAACQ1234A",
          address: "Plot 12", city: "Pune", state: "Maharashtra", pincode: "411057", createdBy,
        },
      }));

  const vendor = await prisma.cnVendor.findFirst({ where: { tenantId, code: "V-CEM-001" } });
  if (!vendor) throw new Error("Seed vendors first via scripts/seed-quikinfra.mjs");

  const project = await prisma.cnProject.upsert({
    where: { tenantId_code: { tenantId, code: "PRJ-001" } },
    update: {},
    create: {
      tenantId, code: "PRJ-001", name: "Shiv Sagar Tower",
      companyId: company.id, city: "Pune", state: "Maharashtra",
      startDate: new Date(), projectValue: 50000000, createdBy,
    },
  });
  const location = await prisma.cnLocation.upsert({
    where: { tenantId_code: { tenantId, code: "LOC-SITE-A" } },
    update: {},
    create: {
      tenantId, code: "LOC-SITE-A", name: "Site A — Hinjewadi",
      type: "site", projectId: project.id, city: "Pune", createdBy,
    },
  });

  // ── PR ────────────────────────────────────────────────────────────
  const existingPr = await prisma.cnPurchaseRequisition.findUnique({
    where: { tenantId_prNumber: { tenantId, prNumber: "PR-SEED-001" } },
  });
  let pr = existingPr;
  if (!pr) {
    pr = await prisma.cnPurchaseRequisition.create({
      data: {
        tenantId, prNumber: "PR-SEED-001", projectId: project.id,
        requestedById: createdBy, requestDate: new Date(),
        purpose: "Ground floor RCC column casting",
        status: "submitted", createdBy,
        lines: {
          create: [
            { itemId: cement.id, quantity: 100, uomId: bag.id, estimatedRate: 420, estimatedAmount: 42000 },
            { itemId: tmt.id,    quantity: 2,   uomId: nos.id, estimatedRate: 58000, estimatedAmount: 116000 },
          ],
        },
      },
    });
    console.log("  PR created (status=submitted):", pr.prNumber);
  } else {
    console.log("  PR exists:", pr.prNumber);
  }

  // ── PO ────────────────────────────────────────────────────────────
  let po = await prisma.cnPurchaseOrder.findUnique({
    where: { tenantId_poNumber: { tenantId, poNumber: "PO-SEED-001" } },
    include: { lines: true },
  });
  if (!po) {
    const subtotal = 42000 + 116000;
    const taxAmount = subtotal * 0.18;
    po = await prisma.cnPurchaseOrder.create({
      data: {
        tenantId, poNumber: "PO-SEED-001", projectId: project.id,
        vendorId: vendor.id, prId: pr.id, poDate: new Date(),
        deliveryDate: new Date(Date.now() + 7 * 86400000), deliveryLocationId: location.id,
        subtotal, taxAmount, totalAmount: subtotal + taxAmount,
        status: "sent", createdBy, paymentTermsDays: 30,
        lines: {
          create: [
            { itemId: cement.id, orderedQty: 100, pendingQty: 100, unitRate: 420,   amount: 42000,  gstRate: 18, taxAmount: 7560,  totalAmount: 49560,  uomId: bag.id },
            { itemId: tmt.id,    orderedQty: 2,   pendingQty: 2,   unitRate: 58000, amount: 116000, gstRate: 18, taxAmount: 20880, totalAmount: 136880, uomId: nos.id },
          ],
        },
      },
      include: { lines: true },
    });
    // Mark PR as converted
    await prisma.cnPurchaseRequisition.update({ where: { id: pr.id }, data: { status: "converted" } });
    console.log("  PO created (status=sent):", po.poNumber);
  } else {
    console.log("  PO exists:", po.poNumber);
  }

  // ── GRN (full receipt, post to ledger) ────────────────────────────
  const existingGrn = await prisma.cnGoodsReceiptNote.findUnique({
    where: { tenantId_grnNumber: { tenantId, grnNumber: "GRN-SEED-001" } },
    include: { lines: true },
  });
  if (!existingGrn) {
    const cementLine = po.lines.find((l) => l.itemId === cement.id);
    const tmtLine = po.lines.find((l) => l.itemId === tmt.id);
    const grn = await prisma.cnGoodsReceiptNote.create({
      data: {
        tenantId, grnNumber: "GRN-SEED-001", poId: po.id, projectId: project.id,
        vendorId: vendor.id, grnDate: new Date(), locationId: location.id,
        supplierInvoiceNo: "INV-ACME-2401", receivedById: createdBy,
        status: "draft", createdBy,
        lines: {
          create: [
            { poLineId: cementLine.id, itemId: cement.id, receivedQty: 100, acceptedQty: 100, rejectedQty: 0, uomId: bag.id, unitRate: 420,   amount: 42000,  qualityStatus: "accepted" },
            { poLineId: tmtLine.id,    itemId: tmt.id,    receivedQty: 2,   acceptedQty: 2,   rejectedQty: 0, uomId: nos.id, unitRate: 58000, amount: 116000, qualityStatus: "accepted" },
          ],
        },
      },
      include: { lines: true },
    });
    // Post (transactional): write stock ledger + update PO pending
    const postedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const l of grn.lines) {
        await tx.cnStockLedger.create({
          data: {
            tenantId, projectId: project.id, locationId: location.id, itemId: l.itemId,
            transactionType: "grn", transactionRefId: grn.id, transactionRefNumber: grn.grnNumber,
            transactionDate: grn.grnDate, qtyIn: l.acceptedQty, qtyOut: 0,
            unitRate: l.unitRate, amount: l.amount, uomId: l.uomId, createdBy,
          },
        });
        if (l.poLineId) {
          await tx.cnPurchaseOrderLine.update({
            where: { id: l.poLineId },
            data: { receivedQty: Number(l.acceptedQty), pendingQty: 0 },
          });
        }
      }
      await tx.cnPurchaseOrder.update({ where: { id: po.id }, data: { status: "fully_received" } });
      await tx.cnGoodsReceiptNote.update({
        where: { id: grn.id },
        data: { status: "posted", postedAt, postedBy: createdBy },
      });
    });
    console.log("  GRN created + posted (stock ledger written):", grn.grnNumber);
  } else {
    console.log("  GRN exists:", existingGrn.grnNumber);
  }

  // ── Material Issue (partial — issue 20 bags of cement) ────────────
  const existingMi = await prisma.cnMaterialIssue.findUnique({
    where: { tenantId_issueNumber: { tenantId, issueNumber: "MI-SEED-001" } },
    include: { lines: true },
  });
  if (!existingMi) {
    const mi = await prisma.cnMaterialIssue.create({
      data: {
        tenantId, issueNumber: "MI-SEED-001", projectId: project.id,
        locationId: location.id, issuedToId: createdBy, issuedById: createdBy,
        issueDate: new Date(), purpose: "Column casting — 1st pour",
        status: "draft", createdBy,
        lines: {
          create: [
            { itemId: cement.id, issuedQty: 20, uomId: bag.id, unitRate: 420, amount: 8400 },
          ],
        },
      },
      include: { lines: true },
    });
    const postedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const l of mi.lines) {
        await tx.cnStockLedger.create({
          data: {
            tenantId, projectId: project.id, locationId: location.id, itemId: l.itemId,
            transactionType: "issue", transactionRefId: mi.id, transactionRefNumber: mi.issueNumber,
            transactionDate: mi.issueDate, qtyIn: 0, qtyOut: l.issuedQty,
            unitRate: l.unitRate, amount: l.amount, uomId: l.uomId, createdBy,
          },
        });
      }
      await tx.cnMaterialIssue.update({
        where: { id: mi.id },
        data: { status: "posted", postedAt, postedBy: createdBy },
      });
    });
    console.log("  MI created + posted (stock decremented):", mi.issueNumber);
  } else {
    console.log("  MI exists:", existingMi.issueNumber);
  }

  const balance = await prisma.cnStockLedger.aggregate({
    where: { tenantId, projectId: project.id, locationId: location.id, itemId: cement.id },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const cementBal = Number(balance._sum.qtyIn ?? 0) - Number(balance._sum.qtyOut ?? 0);

  console.log(`
╔═══════════════════════════════════════════════════╗
║  QuikInfra P2P seed — complete             ║
╠═══════════════════════════════════════════════════╣
║  Cement balance @ Site A:  ${String(cementBal).padEnd(22)} ║
║  (Expected: 100 received − 20 issued = 80)        ║
╚═══════════════════════════════════════════════════╝
`);
}

main()
  .catch((e) => { console.error("✖ SEED FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
