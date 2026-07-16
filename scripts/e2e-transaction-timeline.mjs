// Focused E2E for Closing Center Slice 6 — Transaction Timeline (TX-0). Runs against the *_test DB
// with throwaway orgs. The timeline is a READ-ONLY chronological projection over ActivityLog, so
// this proves:
//   - TL-1 source: one Opportunity's recorded events, org- + opportunity-scoped.
//   - TL-3 ordering: newest-first by default; oldest-first reverses; deterministic.
//   - TL-10 event integrity: every rendered entry corresponds to exactly one persisted event.
//   - TL-11 snapshot reference: escrow/underwriting/generated-doc events link OUT; others don't.
//   - Actor resolution (name, or "System" when unattributed).
//   - Offset pagination (page 2, out-of-range clamp, correct total/pageCount).
//   - The real audit() path feeds the timeline end-to-end (openEscrow → an escrow entry appears).
//   - Org + opportunity isolation: no cross-org and no cross-deal leakage.
//   - TL-6: a timeline read performs NO writes (ActivityLog count + a domain record byte-identical).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { getOpportunityTimeline } from "../lib/transaction-timeline-service.ts";
import { openEscrow } from "../lib/escrow-service.ts";

const TAG = "e2e-txtl";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const at = (iso) => new Date(iso);
const op = (name) => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, name, stage) => {
  const prop = await createPropertyRecord(orgId, op(name), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title: name, stage } });
};
// Insert a persisted event with a controlled timestamp (createdAt is settable on create).
const logEvent = (orgId, oppId, eventType, eventLabel, createdAt, actorId = null, eventBody = null) =>
  prisma.activityLog.create({ data: { organizationId: orgId, opportunityId: oppId, eventType, eventLabel, eventBody, actorId, createdAt } });
const ids = (r) => r.entries.map((e) => e.id);

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Casey Closer", email: `txtl-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS } });

  console.log("\n[1] Seed one opportunity's recorded history (controlled timestamps):");
  const opp1 = await mkOpp(a.id, "Timeline Deal", "CLOSING");
  // Six persisted events across categories + an unattributed one. Distinct ascending timestamps.
  const eStage = await logEvent(a.id, opp1.id, "opportunity.stage_changed", "Stage → Under Contract", at("2026-07-01T09:00:00.000Z"), actor.id);
  const eEscrow = await logEvent(a.id, opp1.id, "escrow.opened", "Escrow opened", at("2026-07-02T09:00:00.000Z"), actor.id, "Holder: Peachtree Escrow");
  const eFin = await logEvent(a.id, opp1.id, "financing.started", "Financing started", at("2026-07-03T09:00:00.000Z"), actor.id);
  const eUw = await logEvent(a.id, opp1.id, "underwriting.decided", "Underwriting decided: PURSUE", at("2026-07-04T09:00:00.000Z"), actor.id);
  const eNote = await logEvent(a.id, opp1.id, "note.created", "Note added", at("2026-07-05T09:00:00.000Z"), null); // unattributed → System
  const eDoc = await logEvent(a.id, opp1.id, "assignment_agreement.generated", "Assignment agreement generated", at("2026-07-06T09:00:00.000Z"), actor.id);
  const seededOrder = [eStage.id, eEscrow.id, eFin.id, eUw.id, eNote.id, eDoc.id]; // chronological
  // A second, unrelated opportunity in the SAME org — must never leak into opp1's timeline.
  const opp2 = await mkOpp(a.id, "Other Deal", "BUYER_MATCHED");
  await logEvent(a.id, opp2.id, "escrow.opened", "Other escrow opened", at("2026-07-02T10:00:00.000Z"), actor.id);
  // An opportunity in org B — cross-org isolation.
  const oppB = await mkOpp(b.id, "Foreign Deal", "CLOSING");
  await logEvent(b.id, oppB.id, "escrow.opened", "Foreign escrow opened", at("2026-07-02T11:00:00.000Z"), null);

  console.log("\n[2] TL-1 / TL-3 — newest-first by default, oldest-first reverses:");
  const newest = await getOpportunityTimeline(a.id, opp1.id, {});
  assert(newest.total === 6, "total counts every recorded event for the opportunity (6)");
  assert(JSON.stringify(ids(newest)) === JSON.stringify([...seededOrder].reverse()), "default order is newest-first");
  const oldest = await getOpportunityTimeline(a.id, opp1.id, { order: "oldest" });
  assert(JSON.stringify(ids(oldest)) === JSON.stringify(seededOrder), "oldest-first returns chronological order");

  console.log("\n[3] Category classification per event:");
  const byId = new Map(newest.entries.map((e) => [e.id, e]));
  assert(byId.get(eStage.id).category === "stage", "stage_changed → stage");
  assert(byId.get(eEscrow.id).category === "escrow", "escrow.opened → escrow");
  assert(byId.get(eFin.id).category === "financing", "financing.started → financing");
  assert(byId.get(eUw.id).category === "underwriting", "underwriting.decided → underwriting");
  assert(byId.get(eNote.id).category === "other", "note.created → other (never hidden, TL-10)");
  assert(byId.get(eDoc.id).category === "documents", "assignment_agreement.generated → documents");

  console.log("\n[4] TL-10 event integrity — every entry maps to a persisted ActivityLog row:");
  const persisted = new Set((await prisma.activityLog.findMany({ where: { organizationId: a.id, opportunityId: opp1.id }, select: { id: true } })).map((r) => r.id));
  assert(newest.entries.every((e) => persisted.has(e.id)), "no synthesized entries — all ids exist in ActivityLog");
  assert(persisted.size === newest.total, "timeline total equals the persisted event count");

  console.log("\n[5] Actor resolution + recorded label/body (never synthesized):");
  assert(byId.get(eEscrow.id).actorName === "Casey Closer", "attributed event resolves the actor name");
  assert(byId.get(eNote.id).actorName === "System", "unattributed event falls back to System");
  assert(byId.get(eEscrow.id).title === "Escrow opened", "entry title is the recorded eventLabel");
  assert(byId.get(eEscrow.id).detail === "Holder: Peachtree Escrow", "entry detail is the recorded eventBody");

  console.log("\n[6] TL-11 snapshot reference — links OUT for named immutable snapshots only:");
  assert(byId.get(eEscrow.id).reference?.href === `/opportunities/${opp1.id}#closing-center`, "escrow event references the Closing Center");
  assert(byId.get(eUw.id).reference?.href === `/analyzer/${opp1.id}`, "underwriting decision references the analyzer");
  assert(byId.get(eDoc.id).reference?.label === "View document", "generated agreement references the document");
  assert(byId.get(eStage.id).reference === null, "stage change has no snapshot reference");
  assert(byId.get(eNote.id).reference === null, "note has no snapshot reference");

  console.log("\n[7] Offset pagination:");
  const p1 = await getOpportunityTimeline(a.id, opp1.id, { pageSize: 4, page: 1 });
  const p2 = await getOpportunityTimeline(a.id, opp1.id, { pageSize: 4, page: 2 });
  assert(p1.pageCount === 2 && p1.total === 6, "pageCount/total computed from pageSize");
  assert(p1.entries.length === 4 && p2.entries.length === 2, "page 1 fills, page 2 holds the remainder");
  assert(JSON.stringify([...ids(p1), ...ids(p2)]) === JSON.stringify(ids(newest)), "pages concatenate to the full newest-first order (no overlap/gap)");
  const pOob = await getOpportunityTimeline(a.id, opp1.id, { pageSize: 4, page: 99 });
  assert(pOob.page === 2, "an out-of-range page clamps to the last page (never blank/500)");

  console.log("\n[8] Isolation — no cross-deal and no cross-org leakage:");
  assert(newest.entries.every((e) => persisted.has(e.id)), "opp2's event does not appear in opp1's timeline");
  const bTimeline = await getOpportunityTimeline(a.id, oppB.id, {});
  assert(bTimeline.total === 0, "org A reading org B's opportunity id sees nothing (org-scoped)");
  const bOwn = await getOpportunityTimeline(b.id, oppB.id, {});
  assert(bOwn.total === 1, "org B reading its own opportunity sees its one event");

  console.log("\n[9] The real audit() path feeds the timeline end-to-end:");
  const opp3 = await mkOpp(a.id, "Live Escrow Deal", "UNDER_CONTRACT");
  await openEscrow(a.id, opp3.id, actor.id, { earnestAmountUsd: 25_000, escrowHolderName: "First Title" });
  const t3 = await getOpportunityTimeline(a.id, opp3.id, {});
  assert(t3.entries.some((e) => e.category === "escrow"), "openEscrow's audit row surfaces as an escrow timeline entry");

  console.log("\n[10] TL-6 — a timeline read performs NO writes:");
  const logBefore = await prisma.activityLog.count({ where: { organizationId: a.id } });
  const oppBefore = await prisma.opportunity.findUnique({ where: { id: opp1.id } });
  await getOpportunityTimeline(a.id, opp1.id, {});
  await getOpportunityTimeline(a.id, opp1.id, { order: "oldest", page: 2, pageSize: 2 });
  const logAfter = await prisma.activityLog.count({ where: { organizationId: a.id } });
  const oppAfter = await prisma.opportunity.findUnique({ where: { id: opp1.id } });
  assert(logBefore === logAfter, "ActivityLog count is unchanged after timeline reads (no replication)");
  assert(oppBefore.updatedAt.getTime() === oppAfter.updatedAt.getTime(), "the opportunity is byte-identical (updatedAt unmoved) after reads");

  console.log("\n[11] Determinism — the same events project identically:");
  assert(JSON.stringify(await getOpportunityTimeline(a.id, opp1.id, {})) === JSON.stringify(newest), "re-projecting the same state yields an identical timeline");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
