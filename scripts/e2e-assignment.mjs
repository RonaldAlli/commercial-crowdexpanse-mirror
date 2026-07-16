// Focused E2E for Closing Center Slice 4 — Assignments. Runs against the *_test DB with
// throwaway orgs. Proves the ratified invariants:
//   - AS-A/AS-1: a first-class AssignmentRecord, 1:1 with Opportunity, org-scoped, idempotent.
//   - AS-B/AS-9: the lifecycle NOT_STARTED→DRAFTED→{EXECUTED} with a CANCELLED off-ramp is
//     enforced by the pure guard; executing straight from NOT_STARTED is rejected.
//   - AS-C: hybrid parties — a free-text name wins; otherwise the linked Seller/Buyer resolves.
//   - AS-L/AS-12: agreement drafts regenerate from CURRENT data (append-only, versioned) UNTIL
//     execution; once EXECUTED (or CANCELLED) generation is DISABLED.
//   - AS-15/AS-E/AS-8: each generated agreement is an immutable, append-only GENERATED Document
//     with a SHA-256 and a per-Opportunity generationSequence (sourceOpportunityId) — the
//     offer-memo (scenario-anchored) unique key is untouched, and a duplicate sequence collides.
//   - AS-D/AS-H/AS-4: execution captures an IMMUTABLE snapshot (fee + contract value from the
//     Opportunity, effective party names, the executed agreement doc) INSIDE the record — no
//     separate ledger — and the record is thereafter FROZEN (edits/transitions rejected).
//   - AS-3: the fee's source of truth stays on Opportunity.assignmentFeeUsd; execution snapshots it.
//   - AS-G: executing is ADMIN-only at the policy layer (canExecuteAssignment).
//   - AS-F/AS-J: PAID is gated via a REQUIRED ASSIGNMENT checklist item; executing the assignment
//     does NOT auto-complete it (no hidden coupling — the gate is composed, never bypassed).
//   - AS-10/AS-13/AS-14: assignment NEVER reads into or writes the underwriting engine; generation
//     reads only operational data.
//   - Audit via ActivityLog; org isolation throughout.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { canExecuteAssignment } from "../lib/permissions.ts";
import {
  getAssignmentRecord,
  ensureAssignmentRecord,
  startAssignment,
  setAssignmentParties,
  generateAssignmentDraft,
  executeAssignment,
  cancelAssignment,
} from "../lib/assignment-service.ts";
import { listGeneratedAgreements } from "../lib/documents/assignment-agreement-service.ts";
import {
  ensureClosingChecklist,
  isOpportunityClosingReady,
  completeChecklistItem,
} from "../lib/closing-service.ts";

const TAG = "e2e-assignment";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }

const op = (name = "Asset") => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkProp = (orgId, name = "Asset") => createPropertyRecord(orgId, op(name), {});
const mkOpp = (orgId, propertyId, extra = {}) =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title: "Deal", ...extra } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = { id: (await prisma.user.create({ data: { organizationId: a.id, name: "Closer", email: `assignment-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ADMIN } })).id, display: "Closer" };

  console.log("\n[1] AssignmentRecord is first-class, 1:1, idempotent (AS-A/AS-1):");
  const prop = await mkProp(a.id);
  const opp = await mkOpp(a.id, prop.id, { contractValueUsd: 1_200_000, assignmentFeeUsd: 45_000 });
  assert((await getAssignmentRecord(a.id, opp.id)) === null, "no assignment record until one is created");
  const r0 = await startAssignment(a.id, opp.id, actor.id);
  assert(r0.status === "NOT_STARTED", "a fresh assignment record starts NOT_STARTED");
  assert((await startAssignment(a.id, opp.id, actor.id)).id === r0.id, "startAssignment is idempotent");
  assert((await ensureAssignmentRecord(a.id, opp.id)).id === r0.id, "ensureAssignmentRecord is idempotent too");
  await throws(() => prisma.assignmentRecord.create({ data: { organizationId: a.id, opportunityId: opp.id } }), "a second assignment record for the same opportunity is rejected (opportunityId unique)");

  console.log("\n[2] Lifecycle guard rejects skips + illegal execution (AS-B/AS-9):");
  await throws(() => executeAssignment(a.id, opp.id, actor.id, "too soon"), "cannot execute straight from NOT_STARTED (must be DRAFTED first)");

  console.log("\n[3] Hybrid parties — free-text overrides, else the linked Seller/Buyer resolves (AS-C):");
  const seller = await prisma.seller.create({ data: { organizationId: a.id, name: "Jane Seller", email: "jane@example.com" } });
  const buyer = await prisma.buyer.create({ data: { organizationId: a.id, name: "Acme Capital LLC", email: "buyer@example.com" } });
  // Link the Seller as assignor (no free-text) and give the assignee a free-text override.
  await setAssignmentParties(a.id, opp.id, actor.id, { assignorSellerId: seller.id, assigneeName: "Beta Holdings LLC", assigneeContact: "ops@beta.example" });

  console.log("\n[4] First draft moves NOT_STARTED → DRAFTED; regenerating appends versioned drafts (AS-B/AS-L/AS-12):");
  const d1 = await generateAssignmentDraft(a.id, opp.id, actor);
  assert((await getAssignmentRecord(a.id, opp.id)).status === "DRAFTED", "the first generated draft transitions the record to DRAFTED");
  assert(d1.generationSequence === 1 && d1.contentSha256.length === 64, "draft #1 has sequence 1 and a SHA-256 content hash (AS-15)");
  const d2 = await generateAssignmentDraft(a.id, opp.id, actor);
  assert(d2.generationSequence === 2 && (await getAssignmentRecord(a.id, opp.id)).status === "DRAFTED", "regenerate appends draft #2 without changing status");
  const drafts = await listGeneratedAgreements(a.id, opp.id);
  assert(drafts.length === 2 && drafts[0].generationSequence === 2, "both drafts are listed, newest first (AS-M)");

  console.log("\n[5] Generated agreement is an immutable GENERATED Document reading only operational data (AS-14/AS-15):");
  const doc2 = await prisma.document.findFirst({ where: { id: d2.id } });
  assert(doc2.origin === "GENERATED" && doc2.documentType === "ASSIGNMENT_AGREEMENT" && doc2.sourceOpportunityId === opp.id, "the draft is a GENERATED, opportunity-anchored ASSIGNMENT_AGREEMENT (AS-E)");
  assert(doc2.sourceScenarioId === null, "an assignment agreement is NOT scenario-anchored — the offer-memo path is untouched (AS-8)");
  const snap = doc2.contentSnapshot;
  const snapStr = JSON.stringify(snap);
  assert(snap.assignor.name === "Jane Seller", "the assignor name resolved from the linked Seller (AS-C, no free-text override)");
  assert(snap.assignee.name === "Beta Holdings LLC", "the assignee name used the free-text override (AS-C)");
  assert(snap.opportunity.assignmentFeeUsd === 45_000 && snap.opportunity.contractValueUsd === 1_200_000, "the agreement reflects the Opportunity's fee + contract value (AS-3)");
  assert(!/dscr|noi|capRate|irr|equityMultiple|leveredIrr/i.test(snapStr), "the agreement snapshot contains NO underwriting outputs (AS-10/AS-14)");
  await throws(
    () => prisma.document.create({ data: { organizationId: a.id, opportunityId: opp.id, title: "dupe", documentType: "ASSIGNMENT_AGREEMENT", storageKey: `${a.id}/dupe.html`, origin: "GENERATED", sourceOpportunityId: opp.id, generationSequence: 2 } }),
    "a duplicate (sourceOpportunityId, documentType, generationSequence) is rejected — append-only per opportunity (AS-8)",
  );

  console.log("\n[6] Execution is ADMIN-only at the policy layer (AS-G):");
  assert(canExecuteAssignment(UserRole.ADMIN) === true, "ADMIN may execute an assignment");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((role) => canExecuteAssignment(role) === false), "no non-ADMIN role may execute an assignment");

  console.log("\n[7] Execution captures an IMMUTABLE AS-D/AS-H snapshot + FREEZES the record (AS-4):");
  const executed = await executeAssignment(a.id, opp.id, actor.id, "Executed at closing");
  assert(executed.status === "EXECUTED" && executed.resolvedById === actor.id && executed.resolvedAt !== null, "execute advances to EXECUTED + records who/when");
  assert(
    executed.executedFeeUsdSnapshot === 45_000 && executed.executedContractValueUsdSnapshot === 1_200_000,
    "the snapshot copies the fee + contract value AT execution (from the Opportunity, AS-3)",
  );
  assert(
    executed.executedAssignorNameSnapshot === "Jane Seller" && executed.executedAssigneeNameSnapshot === "Beta Holdings LLC",
    "the snapshot copies the effective party names AT execution (AS-D)",
  );
  assert(executed.executedAgreementDocumentIdSnapshot === d2.id, "the snapshot links the latest generated agreement (draft #2) as the executed one");
  const ledgers = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'assignment_events'`);
  assert(ledgers[0].n === 0, "there is NO separate AssignmentEvent ledger table (the snapshot lives inside the record)");

  console.log("\n[8] Once EXECUTED the record is frozen + generation is DISABLED (AS-L/AS-12):");
  await throws(() => generateAssignmentDraft(a.id, opp.id, actor), "a resolved assignment cannot regenerate the agreement (AS-L)");
  await throws(() => setAssignmentParties(a.id, opp.id, actor.id, { assignorName: "Someone Else" }), "a resolved assignment is frozen — party edits rejected");
  await throws(() => executeAssignment(a.id, opp.id, actor.id, "again"), "a resolved assignment cannot be executed again");
  await throws(() => cancelAssignment(a.id, opp.id, actor.id, "nope"), "a resolved assignment cannot be cancelled");
  const draftsAfter = await listGeneratedAgreements(a.id, opp.id);
  assert(draftsAfter.length === 2, "no new draft was appended after execution — the executed agreement stays fixed");
  // The fee's source of truth is still the Opportunity — editing it does NOT change the snapshot.
  await prisma.opportunity.update({ where: { id: opp.id }, data: { assignmentFeeUsd: 99_999 } });
  assert((await getAssignmentRecord(a.id, opp.id)).executedFeeUsdSnapshot === 45_000, "editing the Opportunity fee later does NOT rewrite the immutable execution snapshot (AS-3/AS-4)");

  console.log("\n[9] CANCELLED off-ramp is reasoned + freezes (AS-B/AS-4):");
  const cOpp = await mkOpp(a.id, (await mkProp(a.id, "Cancelled Asset")).id, { title: "Cancelled Deal" });
  await startAssignment(a.id, cOpp.id, actor.id);
  await throws(() => cancelAssignment(a.id, cOpp.id, actor.id, "   "), "cancelling requires a non-blank reason");
  const cancelled = await cancelAssignment(a.id, cOpp.id, actor.id, "Buyer walked");
  assert(cancelled.status === "CANCELLED" && cancelled.resolutionReason === "Buyer walked", "NOT_STARTED → CANCELLED works with a reason");
  await throws(() => generateAssignmentDraft(a.id, cOpp.id, actor), "a cancelled assignment cannot generate an agreement");

  console.log("\n[10] AS-J (revised) — the default template seeds NO ASSIGNMENT item; the gate composes over a CONFIGURED one, and executing never auto-completes it:");
  const gOpp = await mkOpp(a.id, (await mkProp(a.id, "Gate Asset")).id, { title: "Gate Deal", contractValueUsd: 500_000, assignmentFeeUsd: 20_000 });
  const cl = await ensureClosingChecklist(a.id, gOpp.id);
  assert(cl.items.every((i) => i.category !== "ASSIGNMENT"), "the default checklist seeds NO ASSIGNMENT item — Closing policy stays configurable (AS-J revised, consistent with escrow/financing)");
  // Complete every default required item → ready; assignment plays no part unless configured.
  for (const it of cl.items.filter((i) => i.required)) await completeChecklistItem(a.id, it.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "PAID is ready on the default template with no assignment involvement");
  // An org that runs assignment deals CONFIGURES a required ASSIGNMENT item itself (like escrow/financing).
  const assignItem = await prisma.closingChecklistItem.create({ data: { organizationId: a.id, checklistId: cl.id, category: "ASSIGNMENT", label: "Assignment agreement executed", required: true, completionEvidenceType: "DOCUMENT", position: 99, status: "PENDING" } });
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === false, "a configured required ASSIGNMENT item re-blocks PAID (the gate composes over it)");
  await startAssignment(a.id, gOpp.id, actor.id);
  await generateAssignmentDraft(a.id, gOpp.id, actor);
  await executeAssignment(a.id, gOpp.id, actor.id, "done");
  const item2 = (await prisma.closingChecklist.findFirst({ where: { opportunityId: gOpp.id }, include: { items: true } })).items.find((i) => i.id === assignItem.id);
  assert(item2.status === "PENDING", "executing the assignment does NOT auto-complete the configured item (no hidden coupling)");
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === false, "PAID stays blocked until a human explicitly completes the ASSIGNMENT item");
  await completeChecklistItem(a.id, item2.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "PAID becomes ready once the ASSIGNMENT item is explicitly completed (the gate is composed, never bypassed)");

  console.log("\n[11] Audit — every transition writes an ActivityLog event:");
  const types = new Set((await prisma.activityLog.findMany({ where: { organizationId: a.id, opportunityId: opp.id, eventType: { startsWith: "assignment" } } })).map((l) => l.eventType));
  assert(types.has("assignment.started"), "start is audited");
  assert(types.has("assignment.drafted"), "drafting is audited");
  assert(types.has("assignment.executed"), "execution is audited");
  assert(types.has("assignment_agreement.generated"), "agreement generation is audited");

  console.log("\n[12] AS-13 — assignment NEVER reads into or writes the underwriting engine:");
  assert((await prisma.underwriting.count({ where: { opportunityId: opp.id } })) === 0, "running the full assignment lifecycle created NO underwriting row");

  console.log("\n[13] Org isolation — an assignment record is invisible/unwritable across orgs:");
  assert((await getAssignmentRecord(b.id, opp.id)) === null, "org B cannot read org A's assignment record");
  await throws(() => generateAssignmentDraft(b.id, gOpp.id, actor), "org B cannot generate an agreement on an org A opportunity");
  await throws(() => executeAssignment(b.id, gOpp.id, actor.id, "nope"), "org B cannot execute an org A assignment");
  await throws(() => ensureAssignmentRecord(b.id, opp.id), "org B cannot materialize assignment on an org A opportunity");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
