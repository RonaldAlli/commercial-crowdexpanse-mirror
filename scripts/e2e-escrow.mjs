// Focused E2E for Closing Center Slice 2 — Escrow. Runs against the *_test DB with
// throwaway orgs. Proves the ratified invariants:
//   - EC-A/EC-2: a first-class EscrowRecord, 1:1 with Opportunity, org-scoped, idempotent.
//   - EC-B/EC-8: the lifecycle NOT_OPENED→OPENED→DEPOSITED→{RELEASED|REFUNDED|FORFEITED} is
//     enforced by the pure guard; stage-skips are rejected.
//   - EC-I/EC-11: a terminal transition writes an IMMUTABLE EscrowEvent SNAPSHOT of
//     amount/holder/proof/actor, and the record is thereafter FROZEN (edits rejected).
//   - EC-C: earnest money is whole-USD Int.
//   - EC-4/EC-G: resolving is reasoned + ADMIN-only (canResolveEscrow).
//   - EC-5: every transition is audited via ActivityLog.
//   - EC-6/EC-H: escrow NEVER gates PAID — closing readiness is unaffected by escrow state.
//   - EC-J: reaching DEPOSITED never auto-completes a checklist item (manual only).
//   - EC-F: proof-of-deposit links a Document (scalar id). Org isolation holds throughout.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { canResolveEscrow } from "../lib/permissions.ts";
import {
  getEscrowRecord,
  ensureEscrowRecord,
  openEscrow,
  setEscrowDetails,
  markEscrowDeposited,
  linkEscrowProof,
  resolveEscrow,
} from "../lib/escrow-service.ts";
import {
  ensureClosingChecklist,
  getClosingChecklist,
  isOpportunityClosingReady,
  completeChecklistItem,
} from "../lib/closing-service.ts";

const TAG = "e2e-escrow";
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
    data: { organizationId: a.id, name: "Closer", email: `escrow-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS },
  });

  console.log("\n[1] EscrowRecord is first-class, 1:1, idempotent (EC-A/EC-2):");
  const opp = await mkOpp(a.id, (await mkProp(a.id)).id);
  assert((await getEscrowRecord(a.id, opp.id)) === null, "no escrow record until one is created");
  const r0 = await ensureEscrowRecord(a.id, opp.id);
  assert(r0.status === "NOT_OPENED", "a fresh escrow record starts NOT_OPENED");
  const r0b = await ensureEscrowRecord(a.id, opp.id);
  assert(r0b.id === r0.id, "ensure is idempotent — same record returned");
  await throws(() => prisma.escrowRecord.create({ data: { organizationId: a.id, opportunityId: opp.id } }), "a second escrow record for the same opportunity is rejected (opportunityId unique)");

  console.log("\n[2] Lifecycle guard rejects stage-skips (EC-B/EC-8):");
  await throws(() => markEscrowDeposited(a.id, opp.id, actor.id), "cannot mark deposited before opening");
  await throws(() => resolveEscrow(a.id, opp.id, actor.id, "RELEASED", "too soon"), "cannot resolve before deposit");

  console.log("\n[3] Open → set details → deposit (EC-B/EC-C):");
  const opened = await openEscrow(a.id, opp.id, actor.id, { earnestAmountUsd: 50000, escrowHolderName: "First Title Co." });
  assert(opened.status === "OPENED" && opened.openedById === actor.id && opened.openedAt !== null, "open records OPENED + who/when");
  assert(opened.earnestAmountUsd === 50000 && opened.escrowHolderName === "First Title Co.", "open seeded amount (Int USD) + holder");
  const detailed = await setEscrowDetails(a.id, opp.id, actor.id, { escrowHolderContact: "escrow@firsttitle.example", earnestDueDate: new Date("2026-08-01T00:00:00.000Z") });
  assert(detailed.escrowHolderContact === "escrow@firsttitle.example" && detailed.earnestDueDate !== null, "details update holder contact + earnest due date");
  const doc = await prisma.document.create({ data: { organizationId: a.id, opportunityId: opp.id, title: "Wire receipt.pdf", documentType: "OTHER", storageKey: `${a.id}/wire.pdf` } });
  const linked = await linkEscrowProof(a.id, opp.id, actor.id, doc.id);
  assert(linked.proofOfDepositDocumentId === doc.id, "proof-of-deposit Document linked (EC-F, scalar id)");
  const deposited = await markEscrowDeposited(a.id, opp.id, actor.id);
  assert(deposited.status === "DEPOSITED" && deposited.depositedById === actor.id && deposited.depositedAt !== null, "deposit records DEPOSITED + who/when");

  console.log("\n[4] Resolution is reasoned + ADMIN-only at the policy layer (EC-4/EC-G):");
  assert(canResolveEscrow(UserRole.ADMIN) === true, "ADMIN may resolve escrow");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((role) => canResolveEscrow(role) === false), "no non-ADMIN role may resolve escrow");
  await throws(() => resolveEscrow(a.id, opp.id, actor.id, "RELEASED", "   "), "resolving requires a non-blank reason");

  console.log("\n[5] Terminal transition writes an IMMUTABLE snapshot + FREEZES the record (EC-I/EC-11):");
  const resolved = await resolveEscrow(a.id, opp.id, actor.id, "RELEASED", "Applied to purchase at closing");
  assert(resolved.status === "RELEASED" && resolved.resolvedById === actor.id && resolved.resolutionReason.length > 0, "resolve advances to RELEASED + records who/when/reason");
  assert(resolved.events.length === 1, "exactly one terminal EscrowEvent was written");
  const ev = resolved.events[0];
  assert(ev.type === "RELEASED" && ev.amountUsdSnapshot === 50000 && ev.holderNameSnapshot === "First Title Co." && ev.proofDocumentIdSnapshot === doc.id && ev.actorId === actor.id, "the event SNAPSHOTS amount/holder/proof/actor at resolution time");
  // Frozen: no further mutation through the service.
  await throws(() => setEscrowDetails(a.id, opp.id, actor.id, { earnestAmountUsd: 999 }), "a resolved record is frozen — details edits rejected");
  await throws(() => linkEscrowProof(a.id, opp.id, actor.id, null), "a resolved record is frozen — proof edits rejected");
  await throws(() => resolveEscrow(a.id, opp.id, actor.id, "REFUNDED", "again"), "a resolved record cannot be resolved again");
  // The immutable event still reflects the historical amount even though the record is terminal.
  const evAfter = await prisma.escrowEvent.findFirst({ where: { escrowRecordId: resolved.id } });
  assert(evAfter.amountUsdSnapshot === 50000, "the terminal event remains an immutable historical fact");

  console.log("\n[6] Audit — every transition writes an ActivityLog event (EC-5):");
  const logs = await prisma.activityLog.findMany({ where: { organizationId: a.id, opportunityId: opp.id, eventType: { startsWith: "escrow." } } });
  const types = new Set(logs.map((l) => l.eventType));
  assert(types.has("escrow.opened"), "open is audited");
  assert(types.has("escrow.deposited"), "deposit is audited");
  assert(types.has("escrow.released"), "release is audited");

  console.log("\n[7] Escrow NEVER gates PAID (EC-6/EC-H) — closing readiness is independent:");
  const gOpp = await mkOpp(a.id, (await mkProp(a.id, "Gate Asset")).id, "Gate Deal");
  const cl = await ensureClosingChecklist(a.id, gOpp.id);
  for (const it of cl.items.filter((i) => i.required)) await completeChecklistItem(a.id, it.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "closing is ready once required checklist items are complete (no escrow involved)");
  await openEscrow(a.id, gOpp.id, actor.id, { earnestAmountUsd: 10000 });
  await markEscrowDeposited(a.id, gOpp.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, gOpp.id)) === true, "opening + depositing escrow does NOT change closing readiness");
  // And an unresolved-vs-resolved escrow never *creates* readiness on its own.
  const uOpp = await mkOpp(a.id, (await mkProp(a.id, "Unready Asset")).id, "Unready Deal");
  await ensureClosingChecklist(a.id, uOpp.id); // required items left PENDING
  await openEscrow(a.id, uOpp.id, actor.id, { earnestAmountUsd: 1 });
  await markEscrowDeposited(a.id, uOpp.id, actor.id);
  await resolveEscrow(a.id, uOpp.id, actor.id, "RELEASED", "released early");
  assert((await isOpportunityClosingReady(a.id, uOpp.id)) === false, "a fully-resolved escrow does NOT satisfy the PAID gate — the gate stays checklist-driven");

  console.log("\n[8] EC-J — reaching DEPOSITED never auto-completes a checklist item (manual only):");
  const jOpp = await mkOpp(a.id, (await mkProp(a.id, "Sync Asset")).id, "Sync Deal");
  const jcl = await ensureClosingChecklist(a.id, jOpp.id);
  const escrowItem = await prisma.closingChecklistItem.create({ data: { organizationId: a.id, checklistId: jcl.id, category: "ESCROW", label: "Earnest money deposited", required: true, completionEvidenceType: "MANUAL", position: 99, status: "PENDING" } });
  await openEscrow(a.id, jOpp.id, actor.id, { earnestAmountUsd: 25000 });
  await markEscrowDeposited(a.id, jOpp.id, actor.id);
  const stillPending = (await getClosingChecklist(a.id, jOpp.id)).items.find((i) => i.id === escrowItem.id);
  assert(stillPending.status === "PENDING", "depositing escrow does NOT auto-complete the ESCROW checklist item (no hidden coupling)");
  await completeChecklistItem(a.id, escrowItem.id, actor.id); // the explicit, human path
  const nowComplete = (await getClosingChecklist(a.id, jOpp.id)).items.find((i) => i.id === escrowItem.id);
  assert(nowComplete.status === "COMPLETE", "the manual 'mark complete' path still works (explicit sync only)");

  console.log("\n[9] Org isolation — an escrow record is invisible/unwritable across orgs:");
  assert((await getEscrowRecord(b.id, opp.id)) === null, "org B cannot read org A's escrow record");
  await throws(() => markEscrowDeposited(b.id, gOpp.id, actor.id), "org B cannot transition an org A escrow");
  await throws(() => resolveEscrow(b.id, gOpp.id, actor.id, "RELEASED", "nope"), "org B cannot resolve an org A escrow");
  await throws(() => ensureEscrowRecord(b.id, opp.id), "org B cannot materialize escrow on an org A opportunity");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
