// Focused E2E for Slice 7 — Opportunity-list Closing Badges. Runs against the *_test DB with
// throwaway orgs. The badges are a READ-ONLY projection over existing closing records, so this
// proves:
//   - LB-9 stage-aware visibility: LEAD/no-activity → hidden; UNDER_CONTRACT+ → visible;
//     early-stage WITH a record → visible; UNDER_CONTRACT without checklist → "Closing not started".
//   - Authoritative readiness + blocker count (reuses closingProgress/blockingItems) and correct
//     Escrow/Financing/Assignment status chips.
//   - LB-4/LB-12 graceful projection: a missing domain record never removes the row.
//   - LB-10 bounded query: the minimal list select (no ActivityLog, no owner, no docs) still projects.
//   - Org isolation; and a list read performs NO writes (counts + escrow updatedAt byte-identical).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { closingProgress, blockingItems } from "../lib/closing.ts";
import { projectClosingBadges } from "../lib/transaction-dashboard.ts";
import { ensureClosingChecklist, completeChecklistItem } from "../lib/closing-service.ts";
import { openEscrow } from "../lib/escrow-service.ts";
import { startFinancing, advanceFinancingStatus } from "../lib/financing-service.ts";
import { startAssignment, generateAssignmentDraft } from "../lib/assignment-service.ts";

const TAG = "e2e-oppbadge";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const op = (name) => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, name, stage) => {
  const prop = await createPropertyRecord(orgId, op(name), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title: name, stage } });
};

// The EXACT minimal list select the page uses (LB-10) — no activities, no owner, no documents.
const LIST_SELECT = {
  property: { select: { name: true } },
  escrow: { select: { status: true } },
  financing: { select: { status: true } },
  assignment: { select: { status: true } },
  closingChecklist: { select: { items: { select: { required: true, status: true } } } },
};
const readList = (orgId) =>
  prisma.opportunity.findMany({ where: { organizationId: orgId }, include: LIST_SELECT, orderBy: { updatedAt: "desc" }, take: 20, skip: 0 });
const toInput = (opp) => ({
  stage: opp.stage,
  checklistItems: opp.closingChecklist ? opp.closingChecklist.items.map((i) => ({ required: i.required, status: i.status })) : null,
  escrow: opp.escrow ? { status: opp.escrow.status } : null,
  financing: opp.financing ? { status: opp.financing.status } : null,
  assignment: opp.assignment ? { status: opp.assignment.status } : null,
});
const badgeFor = (rows, id) => projectClosingBadges(toInput(rows.find((r) => r.id === id)));

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Casey Closer", email: `oppbadge-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS } });

  console.log("\n[1] Seed opportunities across stages + closing states:");
  const lead = await mkOpp(a.id, "Lead (quiet)", "LEAD"); // no closing → hidden
  const ucNoCl = await mkOpp(a.id, "Under contract, no checklist", "UNDER_CONTRACT"); // → "Closing not started"
  const ucBlocked = await mkOpp(a.id, "Under contract, blocked", "UNDER_CONTRACT");
  const cl = await ensureClosingChecklist(a.id, ucBlocked.id); // required items left PENDING → blocked
  await openEscrow(a.id, ucBlocked.id, actor.id, { earnestAmountUsd: 50_000, escrowHolderName: "Peachtree Escrow" });
  await startFinancing(a.id, ucBlocked.id, actor.id);
  await advanceFinancingStatus(a.id, ucBlocked.id, actor.id, "APPLIED");
  await startAssignment(a.id, ucBlocked.id, actor.id);
  await generateAssignmentDraft(a.id, ucBlocked.id, { id: actor.id, display: actor.name });
  const closingReady = await mkOpp(a.id, "Closing, ready", "CLOSING");
  const rcl = await ensureClosingChecklist(a.id, closingReady.id);
  for (const it of rcl.items.filter((i) => i.required)) await completeChecklistItem(a.id, it.id, actor.id);
  const paid = await mkOpp(a.id, "Paid", "PAID");
  const earlyEscrow = await mkOpp(a.id, "Early stage with escrow", "LOI_SENT");
  await openEscrow(a.id, earlyEscrow.id, actor.id, { earnestAmountUsd: 10_000, escrowHolderName: "First Title" });

  const rows = await readList(a.id);

  console.log("\n[2] LB-9 stage-aware visibility:");
  assert(badgeFor(rows, lead.id).visible === false, "LEAD with no closing activity is hidden (quiet)");
  assert(badgeFor(rows, ucNoCl.id).visible === true, "UNDER_CONTRACT is visible even without a checklist");
  assert(badgeFor(rows, earlyEscrow.id).visible === true, "early-stage LOI_SENT WITH an escrow record is visible");
  assert(badgeFor(rows, paid.id).visible === true && badgeFor(rows, paid.id).closed === true, "PAID is visible + closed");

  console.log("\n[3] 'Closing not started' vs started:");
  const bNoCl = badgeFor(rows, ucNoCl.id);
  assert(bNoCl.checklistStarted === false && bNoCl.readiness === null, "no-checklist deal signals 'Closing not started' (readiness null)");
  assert(badgeFor(rows, closingReady.id).readiness?.ready === true, "all-required-complete deal is ready");

  console.log("\n[4] Authoritative readiness + blocker count + domain chips (blocked deal):");
  const bBlocked = badgeFor(rows, ucBlocked.id);
  const blockedItems = toInput(rows.find((r) => r.id === ucBlocked.id)).checklistItems;
  assert(bBlocked.readiness?.ready === closingProgress(blockedItems).ready && bBlocked.readiness?.ready === false, "blocked deal is not ready (matches closingProgress)");
  assert(bBlocked.readiness?.blockerCount === blockingItems(blockedItems).length && bBlocked.readiness.blockerCount > 0, "blocker count matches authoritative blockingItems");
  assert(bBlocked.escrow?.label && bBlocked.financing?.label && bBlocked.assignment?.label, "Escrow/Financing/Assignment chips are all present");

  console.log("\n[5] LB-4/LB-12 graceful projection — a missing record never removes the row:");
  const bReady = badgeFor(rows, closingReady.id);
  assert(bReady.escrow === null && bReady.financing === null && bReady.assignment === null, "ready deal (no escrow/financing/assignment) still projects null chips, row intact");
  assert(rows.some((r) => r.id === closingReady.id), "the row is present despite missing domain records");

  console.log("\n[6] Org isolation:");
  const oppB = await mkOpp(b.id, "Foreign deal", "UNDER_CONTRACT");
  const rowsA = await readList(a.id);
  assert(!rowsA.some((r) => r.id === oppB.id), "org A's list never contains org B's opportunity");
  const rowsB = await readList(b.id);
  assert(rowsB.length === 1 && rowsB[0].id === oppB.id, "org B sees only its own opportunity");

  console.log("\n[7] LB-10 — the list read performs NO writes:");
  const countAll = async () => ({
    opp: await prisma.opportunity.count({ where: { organizationId: a.id } }),
    item: await prisma.closingChecklistItem.count({ where: { organizationId: a.id } }),
    escrow: await prisma.escrowRecord.count({ where: { organizationId: a.id } }),
    fin: await prisma.financingRecord.count({ where: { organizationId: a.id } }),
    asn: await prisma.assignmentRecord.count({ where: { organizationId: a.id } }),
    log: await prisma.activityLog.count({ where: { organizationId: a.id } }),
  });
  const escrowBefore = await prisma.escrowRecord.findFirst({ where: { opportunityId: ucBlocked.id } });
  const before = await countAll();
  await readList(a.id);
  await readList(a.id);
  const after = await countAll();
  assert(JSON.stringify(before) === JSON.stringify(after), "row counts across every closing table + ActivityLog are unchanged after list reads");
  const escrowAfter = await prisma.escrowRecord.findFirst({ where: { opportunityId: ucBlocked.id } });
  assert(escrowBefore.updatedAt.getTime() === escrowAfter.updatedAt.getTime(), "an existing closing record is byte-identical (updatedAt unmoved) after list reads");

  console.log("\n[8] Determinism:");
  assert(JSON.stringify((await readList(a.id)).map(toInput).map(projectClosingBadges)) === JSON.stringify(rows.map(toInput).map(projectClosingBadges)), "re-projecting the same records yields identical badges");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
