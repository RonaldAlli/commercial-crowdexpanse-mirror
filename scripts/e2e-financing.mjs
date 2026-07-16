// Focused E2E for Closing Center Slice 3 — Financing. Runs against the *_test DB with
// throwaway orgs. Proves the ratified invariants:
//   - FC-A/FC-2: a first-class FinancingRecord, 1:1 with Opportunity, org-scoped, idempotent.
//   - FC-B/FC-10: the lifecycle NOT_STARTED→APPLIED→COMMITTED→CLEARED→{FUNDED} with DENIED/
//     WITHDRAWN off-ramps is enforced by the pure guard; stage-skips are rejected. Advancing
//     stamps the milestone date for the target status.
//   - FC-J/FC-6: a terminal transition captures an IMMUTABLE resolution SNAPSHOT (lender +
//     commitment/appraisal doc + actor + reason) INSIDE the record — no separate ledger (FC-I)
//     — and the record is thereafter FROZEN (edits rejected).
//   - FC-5/FC-C: financing carries NO money fields.
//   - FC-4/FC-G: resolving is reasoned + ADMIN-only (canResolveFinancing).
//   - FC-7: every transition is audited via ActivityLog.
//   - FC-6/FC-H: financing NEVER gates PAID — closing readiness is unaffected by financing state.
//   - FC-0/FC-14: financing NEVER reads into or writes the underwriting engine — running the
//     full lifecycle creates/mutates no Underwriting row (funding triggers no recalculation).
//   - FC-E: commitment/appraisal link Documents (scalar ids), scoped to the opportunity. Org
//     isolation holds throughout.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { canResolveFinancing } from "../lib/permissions.ts";
import {
  getFinancingRecord,
  ensureFinancingRecord,
  startFinancing,
  advanceFinancingStatus,
  setFinancingLender,
  setFinancingMilestone,
  linkFinancingDocuments,
  resolveFinancing,
} from "../lib/financing-service.ts";
import {
  ensureClosingChecklist,
  isOpportunityClosingReady,
  completeChecklistItem,
} from "../lib/closing-service.ts";

const TAG = "e2e-financing";
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
const mkOpp = (orgId, propertyId, title = "Deal") => prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({
    data: { organizationId: a.id, name: "Closer", email: `financing-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS },
  });

  console.log("\n[1] FinancingRecord is first-class, 1:1, idempotent (FC-A/FC-2):");
  const opp = await mkOpp(a.id, (await mkProp(a.id)).id);
  assert((await getFinancingRecord(a.id, opp.id)) === null, "no financing record until one is created");
  const r0 = await startFinancing(a.id, opp.id, actor.id);
  assert(r0.status === "NOT_STARTED", "a fresh financing record starts NOT_STARTED");
  const r0b = await startFinancing(a.id, opp.id, actor.id);
  assert(r0b.id === r0.id, "startFinancing is idempotent — same record returned");
  const r0c = await ensureFinancingRecord(a.id, opp.id);
  assert(r0c.id === r0.id, "ensureFinancingRecord is idempotent too");
  await throws(() => prisma.financingRecord.create({ data: { organizationId: a.id, opportunityId: opp.id } }), "a second financing record for the same opportunity is rejected (opportunityId unique)");

  console.log("\n[2] FC-5/FC-C — the record carries NO money fields:");
  const moneyKeys = Object.keys(r0).filter((k) => /amount|usd|loan|dscr|ltv|ltc|price|value/i.test(k));
  assert(moneyKeys.length === 0, `financing record has no money/loan columns (found: ${moneyKeys.join(", ") || "none"})`);

  console.log("\n[3] Lifecycle guard rejects stage-skips (FC-B/FC-10):");
  await throws(() => advanceFinancingStatus(a.id, opp.id, actor.id, "COMMITTED"), "cannot jump NOT_STARTED → COMMITTED");
  await throws(() => advanceFinancingStatus(a.id, opp.id, actor.id, "FUNDED"), "advanceFinancingStatus refuses a terminal target");
  await throws(() => resolveFinancing(a.id, opp.id, actor.id, "FUNDED", "too soon"), "cannot resolve FUNDED before CLEARED");

  console.log("\n[4] Happy path: apply → committed → clear, stamping milestone dates (FC-B):");
  const applied = await advanceFinancingStatus(a.id, opp.id, actor.id, "APPLIED");
  assert(applied.status === "APPLIED" && applied.applicationSubmittedDate !== null, "APPLIED stamps applicationSubmittedDate");
  const withLender = await setFinancingLender(a.id, opp.id, actor.id, { lenderName: "Acme Bank", lenderContact: "loans@acme.example" });
  assert(withLender.lenderName === "Acme Bank" && withLender.lenderContact === "loans@acme.example", "lender name + contact set (FC-D)");
  const withMilestone = await setFinancingMilestone(a.id, opp.id, actor.id, "appraisalOrderedDate", new Date("2026-08-01T00:00:00.000Z"));
  assert(withMilestone.appraisalOrderedDate !== null, "an informational milestone date can be set");
  await throws(() => setFinancingMilestone(a.id, opp.id, actor.id, "fundedDate", new Date()), "fundedDate is not a settable informational milestone (owned by resolution)");
  const committed = await advanceFinancingStatus(a.id, opp.id, actor.id, "COMMITTED");
  assert(committed.status === "COMMITTED" && committed.commitmentReceivedDate !== null, "COMMITTED stamps commitmentReceivedDate");
  const doc = await prisma.document.create({ data: { organizationId: a.id, opportunityId: opp.id, title: "Commitment.pdf", documentType: "OTHER", storageKey: `${a.id}/commit.pdf` } });
  const appraisalDoc = await prisma.document.create({ data: { organizationId: a.id, opportunityId: opp.id, title: "Appraisal.pdf", documentType: "OTHER", storageKey: `${a.id}/appraisal.pdf` } });
  const linked = await linkFinancingDocuments(a.id, opp.id, actor.id, { commitmentLetterDocumentId: doc.id, appraisalDocumentId: appraisalDoc.id });
  assert(linked.commitmentLetterDocumentId === doc.id && linked.appraisalDocumentId === appraisalDoc.id, "commitment + appraisal Documents linked (FC-E, scalar ids)");
  const cleared = await advanceFinancingStatus(a.id, opp.id, actor.id, "CLEARED");
  assert(cleared.status === "CLEARED" && cleared.conditionsSatisfiedDate !== null, "CLEARED stamps conditionsSatisfiedDate");

  console.log("\n[5] Resolution is reasoned + ADMIN-only at the policy layer (FC-4/FC-G):");
  assert(canResolveFinancing(UserRole.ADMIN) === true, "ADMIN may resolve financing");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((role) => canResolveFinancing(role) === false), "no non-ADMIN role may resolve financing");
  await throws(() => resolveFinancing(a.id, opp.id, actor.id, "FUNDED", "   "), "resolving requires a non-blank reason");

  console.log("\n[6] Terminal transition captures an IMMUTABLE FC-J snapshot + FREEZES the record (FC-J/FC-6):");
  const funded = await resolveFinancing(a.id, opp.id, actor.id, "FUNDED", "Loan funded at closing");
  assert(funded.status === "FUNDED" && funded.resolvedById === actor.id && funded.resolutionReason.length > 0, "resolve advances to FUNDED + records who/when/reason");
  assert(funded.fundedDate !== null, "FUNDED stamps fundedDate");
  assert(
    funded.resolutionLenderNameSnapshot === "Acme Bank" &&
      funded.resolutionCommitmentDocumentIdSnapshot === doc.id &&
      funded.resolutionAppraisalDocumentIdSnapshot === appraisalDoc.id,
    "the snapshot copies lender + commitment + appraisal AT resolution time (inside the record)",
  );
  const ledgers = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'financing_events'`,
  );
  assert(ledgers[0].n === 0, "FC-I — there is NO separate FinancingEvent ledger table");
  // Frozen: no further mutation through the service.
  await throws(() => setFinancingLender(a.id, opp.id, actor.id, { lenderName: "Other" }), "a resolved record is frozen — lender edits rejected");
  await throws(() => setFinancingMilestone(a.id, opp.id, actor.id, "appraisalOrderedDate", null), "a resolved record is frozen — milestone edits rejected");
  await throws(() => linkFinancingDocuments(a.id, opp.id, actor.id, { commitmentLetterDocumentId: null }), "a resolved record is frozen — document edits rejected");
  await throws(() => advanceFinancingStatus(a.id, opp.id, actor.id, "APPLIED"), "a resolved record cannot transition again");
  await throws(() => resolveFinancing(a.id, opp.id, actor.id, "DENIED", "again"), "a resolved record cannot be resolved again");
  const stored = await getFinancingRecord(a.id, opp.id);
  assert(stored.resolutionLenderNameSnapshot === "Acme Bank", "the resolution snapshot remains an immutable historical fact");

  console.log("\n[7] DENIED/WITHDRAWN off-ramps are reachable from active states (FC-B):");
  const dOpp = await mkOpp(a.id, (await mkProp(a.id, "Denied Asset")).id, "Denied Deal");
  await advanceFinancingStatus(a.id, dOpp.id, actor.id, "APPLIED");
  const denied = await resolveFinancing(a.id, dOpp.id, actor.id, "DENIED", "Underwriting declined");
  assert(denied.status === "DENIED" && denied.fundedDate === null, "APPLIED → DENIED works and does NOT set fundedDate");
  const wOpp = await mkOpp(a.id, (await mkProp(a.id, "Withdrawn Asset")).id, "Withdrawn Deal");
  await startFinancing(a.id, wOpp.id, actor.id);
  const withdrawn = await resolveFinancing(a.id, wOpp.id, actor.id, "WITHDRAWN", "Buyer switched to cash");
  assert(withdrawn.status === "WITHDRAWN", "NOT_STARTED → WITHDRAWN works (abandon before applying)");

  console.log("\n[8] Audit — every transition writes an ActivityLog event (FC-7):");
  const logs = await prisma.activityLog.findMany({ where: { organizationId: a.id, opportunityId: opp.id, eventType: { startsWith: "financing." } } });
  const types = new Set(logs.map((l) => l.eventType));
  assert(types.has("financing.applied"), "apply is audited");
  assert(types.has("financing.committed"), "commit is audited");
  assert(types.has("financing.cleared"), "clear is audited");
  assert(types.has("financing.funded"), "funding is audited");

  console.log("\n[9] Financing NEVER gates PAID (FC-6/FC-H) — closing readiness is independent:");
  const gOpp = await mkOpp(a.id, (await mkProp(a.id, "Gate Asset")).id, "Gate Deal");
  const cl = await ensureClosingChecklist(a.id, gOpp.id);
  for (const it of cl.items.filter((i) => i.required)) await completeChecklistItem(a.id, it.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "closing is ready once required checklist items are complete (no financing involved)");
  await startFinancing(a.id, gOpp.id, actor.id);
  await advanceFinancingStatus(a.id, gOpp.id, actor.id, "APPLIED");
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "starting + advancing financing does NOT change closing readiness");
  const uOpp = await mkOpp(a.id, (await mkProp(a.id, "Unready Asset")).id, "Unready Deal");
  await ensureClosingChecklist(a.id, uOpp.id); // required items left PENDING
  await advanceFinancingStatus(a.id, uOpp.id, actor.id, "APPLIED");
  await advanceFinancingStatus(a.id, uOpp.id, actor.id, "COMMITTED");
  await advanceFinancingStatus(a.id, uOpp.id, actor.id, "CLEARED");
  await resolveFinancing(a.id, uOpp.id, actor.id, "FUNDED", "funded");
  assert((await isOpportunityClosingReady(a.id, uOpp.id)) === false, "a fully-funded financing does NOT satisfy the PAID gate — the gate stays checklist-driven");

  console.log("\n[10] FC-0/FC-14 — financing NEVER reads into or writes the underwriting engine:");
  const uwCount = await prisma.underwriting.count({ where: { opportunityId: opp.id } });
  assert(uwCount === 0, "running the full financing lifecycle created NO underwriting row (financing never writes the engine)");
  const caseCount = await prisma.financingCase.count({ where: { organizationId: a.id } });
  assert(caseCount === 0, "no underwriting FinancingCase was created or touched by closing financing (distinct concept, FC-1)");

  console.log("\n[11] Org isolation — a financing record is invisible/unwritable across orgs:");
  assert((await getFinancingRecord(b.id, opp.id)) === null, "org B cannot read org A's financing record");
  await throws(() => advanceFinancingStatus(b.id, gOpp.id, actor.id, "COMMITTED"), "org B cannot transition an org A financing");
  await throws(() => resolveFinancing(b.id, gOpp.id, actor.id, "FUNDED", "nope"), "org B cannot resolve an org A financing");
  await throws(() => ensureFinancingRecord(b.id, opp.id), "org B cannot materialize financing on an org A opportunity");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
