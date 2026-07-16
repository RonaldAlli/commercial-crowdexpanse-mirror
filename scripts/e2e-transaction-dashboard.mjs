// Focused E2E for Closing Center Slice 5 — Transaction Dashboard. Runs against the *_test DB
// with throwaway orgs. The dashboard is a READ-ONLY projection, so this proves:
//   - TD-A inclusion: only deals in-flight past UNDER_CONTRACT appear (UNDER_CONTRACT/
//     BUYER_MATCHED/CLOSING); PAID is excluded unless includeClosed; pre-UNDER_CONTRACT never shows.
//   - TD-5 readiness + blockers reuse the authoritative Closing helpers (dashboard can't disagree).
//   - Correct Escrow/Financing/Assignment status projection; missing optional records still yield a row.
//   - TD-D next-milestone: overdue detection with an INJECTED reference date.
//   - Responsible-party projection from outstanding required-item owners.
//   - CLOSING-read authorization at the policy layer (all four roles read).
//   - Org isolation: org B sees none of org A's transactions.
//   - TX-2/TX-3: a dashboard read performs NO writes — table counts unchanged + a domain record
//     stays byte-identical (updatedAt unmoved) across reads.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { can } from "../lib/permissions.ts";
import { getTransactionDashboardRows } from "../lib/transaction-dashboard-service.ts";
import { ensureClosingChecklist, completeChecklistItem } from "../lib/closing-service.ts";
import { openEscrow } from "../lib/escrow-service.ts";
import { startFinancing, advanceFinancingStatus } from "../lib/financing-service.ts";
import { startAssignment, generateAssignmentDraft } from "../lib/assignment-service.ts";

const TAG = "e2e-txdash";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const REF = Date.parse("2026-07-16T00:00:00.000Z");
const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const op = (name) => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, name, stage, extra = {}) => {
  const prop = await createPropertyRecord(orgId, op(name), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title: name, stage, ...extra } });
};
const rowFor = (rows, id) => rows.find((r) => r.opportunityId === id);

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Casey Closer", email: `txdash-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS } });

  console.log("\n[1] Seed opportunities across stages + closing states:");
  // opp1: UNDER_CONTRACT, blocked checklist (owner assigned), escrow OPENED, financing APPLIED,
  // assignment DRAFTED, overdue target close.
  const opp1 = await mkOpp(a.id, "Overdue Deal", "UNDER_CONTRACT", { targetCloseDate: day("2026-07-10"), contractValueUsd: 1_000_000, assignmentFeeUsd: 30_000 });
  const cl1 = await ensureClosingChecklist(a.id, opp1.id); // required items left PENDING → blocked
  await prisma.closingChecklistItem.update({ where: { id: cl1.items.find((i) => i.required).id }, data: { ownerId: actor.id } });
  await openEscrow(a.id, opp1.id, actor.id, { earnestAmountUsd: 50_000, escrowHolderName: "Peachtree Escrow" });
  await startFinancing(a.id, opp1.id, actor.id);
  await advanceFinancingStatus(a.id, opp1.id, actor.id, "APPLIED");
  await startAssignment(a.id, opp1.id, actor.id);
  await generateAssignmentDraft(a.id, opp1.id, { id: actor.id, display: actor.name });
  // opp2: CLOSING, checklist all required complete (ready), NO escrow/financing/assignment.
  const opp2 = await mkOpp(a.id, "Ready Deal", "CLOSING");
  const cl2 = await ensureClosingChecklist(a.id, opp2.id);
  for (const it of cl2.items.filter((i) => i.required)) await completeChecklistItem(a.id, it.id, actor.id);
  // opp3: BUYER_MATCHED, NO checklist started.
  const opp3 = await mkOpp(a.id, "No Checklist Deal", "BUYER_MATCHED");
  // opp4: PAID (closed). opp5: LEAD (pre-under-contract).
  const opp4 = await mkOpp(a.id, "Closed Deal", "PAID");
  const opp5 = await mkOpp(a.id, "Early Deal", "LEAD");
  assert(true, "seeded 5 opportunities across stages");

  console.log("\n[2] TD-A inclusion — only in-flight past UNDER_CONTRACT by default:");
  const rows = await getTransactionDashboardRows(a.id, { referenceMs: REF });
  const ids = new Set(rows.map((r) => r.opportunityId));
  assert(ids.has(opp1.id) && ids.has(opp2.id) && ids.has(opp3.id), "UNDER_CONTRACT + BUYER_MATCHED + CLOSING are included");
  assert(!ids.has(opp4.id), "PAID (closed) is excluded by default");
  assert(!ids.has(opp5.id), "a pre-UNDER_CONTRACT (LEAD) deal never appears");
  assert(rows.length === 3, "exactly the three in-flight deals are returned");

  console.log("\n[3] includeClosed + stage filter:");
  const withClosed = await getTransactionDashboardRows(a.id, { includeClosed: true, referenceMs: REF });
  assert(new Set(withClosed.map((r) => r.opportunityId)).has(opp4.id) && withClosed.length === 4, "includeClosed adds the PAID deal (4 rows)");
  const closingOnly = await getTransactionDashboardRows(a.id, { stage: "CLOSING", referenceMs: REF });
  assert(closingOnly.length === 1 && closingOnly[0].opportunityId === opp2.id, "stage=CLOSING narrows to just the CLOSING deal");

  console.log("\n[4] TD-5 readiness + blockers reuse the authoritative helpers:");
  const r1 = rowFor(rows, opp1.id), r2 = rowFor(rows, opp2.id), r3 = rowFor(rows, opp3.id);
  assert(r2.readiness && r2.readiness.ready === true && r2.readiness.blockerLabels.length === 0, "the all-complete deal is Ready with no blockers");
  assert(r1.readiness && r1.readiness.ready === false && r1.readiness.outstandingCount > 0 && r1.readiness.blockerLabels.length > 0, "the pending deal is Not-ready with named blockers");
  assert(r3.readiness === null, "a deal with no checklist projects readiness = null (explicit empty state)");

  console.log("\n[5] Status projection + missing optional records still yield a row:");
  assert(r1.escrow?.label === "Opened" && r1.financing?.label === "Applied" && r1.assignment?.label === "Drafted", "escrow/financing/assignment statuses project correctly");
  assert(r2.escrow === null && r2.financing === null && r2.assignment === null, "a deal missing all optional records still appears, with null status chips (never excluded/crashing)");

  console.log("\n[6] TD-D next-milestone — overdue detection with the injected reference date:");
  assert(r1.nextMilestone && r1.nextMilestone.overdue === true && r1.nextMilestone.label === "Target close", "opp1's past target-close is surfaced as overdue");
  assert(r2.nextMilestone === null, "a deal with no live deadline has no next milestone");

  console.log("\n[7] Responsible-party projection from outstanding required-item owners:");
  assert(r1.responsibleParties.includes("Casey Closer"), "the owner of an outstanding required item is the responsible party");
  assert(r2.responsibleParties.length === 0, "a ready deal (no outstanding items) has no responsible party");

  console.log("\n[8] CLOSING-read authorization (all four roles read):");
  assert([UserRole.ADMIN, UserRole.ACQUISITIONS, UserRole.DISPOSITIONS, UserRole.ANALYST].every((role) => can(role, "READ", "CLOSING")), "every role holds CLOSING read");

  console.log("\n[9] Org isolation — org B sees none of org A's transactions:");
  const bRows = await getTransactionDashboardRows(b.id, { includeClosed: true, referenceMs: REF });
  assert(bRows.length === 0, "org B's dashboard is empty (no cross-tenant leakage)");

  console.log("\n[10] TX-2/TX-3 — a dashboard read performs NO writes:");
  const countAll = async () => ({
    opp: await prisma.opportunity.count({ where: { organizationId: a.id } }),
    item: await prisma.closingChecklistItem.count({ where: { organizationId: a.id } }),
    escrow: await prisma.escrowRecord.count({ where: { organizationId: a.id } }),
    fin: await prisma.financingRecord.count({ where: { organizationId: a.id } }),
    asn: await prisma.assignmentRecord.count({ where: { organizationId: a.id } }),
    log: await prisma.activityLog.count({ where: { organizationId: a.id } }),
    doc: await prisma.document.count({ where: { organizationId: a.id } }),
  });
  const escrowBefore = await prisma.escrowRecord.findFirst({ where: { opportunityId: opp1.id } });
  const before = await countAll();
  await getTransactionDashboardRows(a.id, { includeClosed: true, referenceMs: REF });
  await getTransactionDashboardRows(a.id, { stage: "UNDER_CONTRACT", referenceMs: REF });
  const after = await countAll();
  assert(JSON.stringify(before) === JSON.stringify(after), "row counts across every closing table are unchanged after dashboard reads (no writes, no ActivityLog replication)");
  const escrowAfter = await prisma.escrowRecord.findFirst({ where: { opportunityId: opp1.id } });
  assert(escrowBefore.updatedAt.getTime() === escrowAfter.updatedAt.getTime(), "an existing Closing record is byte-identical (updatedAt unmoved) after dashboard reads");

  console.log("\n[11] Determinism — the same records + reference date project identical rows:");
  assert(JSON.stringify(await getTransactionDashboardRows(a.id, { referenceMs: REF })) === JSON.stringify(rows), "re-projecting the same state yields identical rows (TX-2 purity)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
