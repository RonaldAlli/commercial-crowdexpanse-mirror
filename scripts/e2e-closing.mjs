// Focused E2E for the Closing Center (v1.4, Slice 1: Closing Foundation + Due
// Diligence + the PAID gate). Runs against the *_test DB with throwaway orgs.
// Proves the ratified invariants:
//   - CC-G/CC-9: the org's default template is seeded on first use; checklist items
//     are a one-way SNAPSHOT of the template (Template → instantiate → Checklist).
//   - CC-10: an instantiated checklist is immutable w.r.t. later template evolution —
//     editing/versioning the template never rewrites an existing checklist, but a
//     newly instantiated opportunity reflects the new template.
//   - CC-2/CC-3: isOpportunityClosingReady is the PURE gate composed with role auth —
//     a required PENDING item blocks PAID; COMPLETE or WAIVED satisfies; a required
//     item can never be marked NOT_APPLICABLE (must be WAIVED); non-required never blocks.
//   - CC-5: waiving requires a reason and is ADMIN-only (canWaiveClosingItem).
//   - CC-B/CC-6: every state change is audited via ActivityLog; who/when recorded.
//   - org scoping: a checklist/item is invisible and unwritable across orgs.
//   - CC-E: evidence links to a Document (scalar id, no FK).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { DEFAULT_CLOSING_TEMPLATE, isClosingReady, closingProgress } from "../lib/closing.ts";
import { canWaiveClosingItem } from "../lib/permissions.ts";
import {
  getOrSeedActiveTemplate,
  ensureClosingChecklist,
  getClosingChecklist,
  isOpportunityClosingReady,
  completeChecklistItem,
  reopenChecklistItem,
  markItemNotApplicable,
  waiveChecklistItem,
  setItemOwner,
  setItemDueDate,
  linkItemEvidence,
} from "../lib/closing-service.ts";

const TAG = "e2e-closing";
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
const mkOpp = (orgId, propertyId, title = "Deal") =>
  prisma.opportunity.create({ data: { organizationId: orgId, propertyId, title } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({
    data: { organizationId: a.id, name: "Closer", email: `closer-${process.pid}@example.com`, hashedPassword: "x", role: UserRole.ACQUISITIONS },
  });

  console.log("\n[1] First use seeds the org's default DUE_DILIGENCE template (CC-G):");
  const tmpl = await getOrSeedActiveTemplate(a.id);
  assert(tmpl.isDefault && tmpl.isActive && tmpl.version === 1, "seeded template is the active default at version 1");
  assert(tmpl.items.length === DEFAULT_CLOSING_TEMPLATE.items.length, "template item count matches the code-defined default");
  assert(tmpl.items.every((i) => i.category === "DUE_DILIGENCE"), "every seeded item is Due Diligence (slice 1 scope)");
  const seedAgain = await getOrSeedActiveTemplate(a.id);
  assert(seedAgain.id === tmpl.id, "seeding is idempotent — the active template is reused, not duplicated");
  assert((await prisma.closingChecklistTemplate.count({ where: { organizationId: a.id } })) === 1, "exactly one template exists after repeated seeding");

  console.log("\n[2] Instantiation SNAPSHOTS the template into concrete items (CC-G/CC-10):");
  const prop = await mkProp(a.id);
  const opp = await mkOpp(a.id, prop.id);
  const cl = await ensureClosingChecklist(a.id, opp.id);
  assert(cl.opportunityId === opp.id && cl.sourceTemplateId === tmpl.id, "checklist links its opportunity + source template");
  assert(cl.templateVersion === 1, "checklist captures the template version it was instantiated from (CC-9)");
  assert(cl.items.length === tmpl.items.length, "every template item was snapshotted onto the checklist");
  assert(cl.items.every((i) => i.status === "PENDING"), "all snapshotted items start PENDING");
  const again = await ensureClosingChecklist(a.id, opp.id);
  assert(again.id === cl.id && again.items.length === cl.items.length, "ensure is idempotent — a second call returns the same checklist (no duplicate items)");
  await throws(
    () => prisma.closingChecklist.create({ data: { organizationId: a.id, opportunityId: opp.id } }),
    "a second checklist for the same opportunity is rejected (opportunityId unique)",
  );

  console.log("\n[3] The PAID gate is pure over required items (CC-2/CC-3):");
  const required = cl.items.filter((i) => i.required);
  const optional = cl.items.filter((i) => !i.required);
  assert(required.length > 0 && optional.length > 0, "the default template has both required and optional items");
  assert((await isOpportunityClosingReady(a.id, opp.id)) === false, "not ready while a required item is PENDING");
  const prog0 = closingProgress(cl.items);
  assert(prog0.requiredTotal === required.length && prog0.requiredSatisfied === 0 && !prog0.ready, "progress: 0 of N required satisfied, not ready");
  // Complete all-but-one required — still blocked.
  for (const it of required.slice(0, -1)) await completeChecklistItem(a.id, it.id, actor.id);
  assert((await isOpportunityClosingReady(a.id, opp.id)) === false, "still blocked with one required item outstanding");
  // Optional items never affect the gate.
  await completeChecklistItem(a.id, optional[0].id, actor.id);
  assert((await isOpportunityClosingReady(a.id, opp.id)) === false, "completing an optional item does not unblock the gate");
  // Complete the last required → ready.
  const last = required[required.length - 1];
  const done = await completeChecklistItem(a.id, last.id, actor.id);
  assert(done.status === "COMPLETE" && done.completedById === actor.id && done.completedAt !== null, "completion records who + when (CC-B)");
  assert((await isOpportunityClosingReady(a.id, opp.id)) === true, "ready once every required item is COMPLETE");

  console.log("\n[4] Reopen re-blocks; WAIVE (with reason) re-satisfies (CC-2/CC-5):");
  const reopened = await reopenChecklistItem(a.id, last.id, actor.id);
  assert(reopened.status === "PENDING" && reopened.completedById === null, "reopen clears completion state → PENDING");
  assert((await isOpportunityClosingReady(a.id, opp.id)) === false, "reopening a required item blocks the gate again");
  await throws(() => waiveChecklistItem(a.id, last.id, actor.id, "   "), "waiving requires a non-blank reason");
  const waived = await waiveChecklistItem(a.id, last.id, actor.id, "Title cleared out-of-band by counsel");
  assert(waived.status === "WAIVED" && waived.waivedById === actor.id && waived.waivedAt !== null && waived.waiverReason.length > 0, "waive records who + when + reason (CC-B)");
  assert(waived.completedById === null, "waiving clears any prior completion attribution");
  assert((await isOpportunityClosingReady(a.id, opp.id)) === true, "a WAIVED required item satisfies the gate");

  console.log("\n[5] NOT_APPLICABLE is for optional items only; required must be WAIVED (CC-5):");
  await throws(() => markItemNotApplicable(a.id, required[0].id, actor.id), "a required item cannot be marked NOT_APPLICABLE");
  const na = await markItemNotApplicable(a.id, optional[0].id, actor.id);
  assert(na.status === "NOT_APPLICABLE", "an optional item can be marked NOT_APPLICABLE");
  assert(isClosingReady((await getClosingChecklist(a.id, opp.id)).items) === true, "an optional NOT_APPLICABLE item never blocks the gate");

  console.log("\n[6] Waiving is ADMIN-only at the policy layer (CC-5):");
  assert(canWaiveClosingItem(UserRole.ADMIN) === true, "ADMIN may waive");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((r) => canWaiveClosingItem(r) === false), "no non-ADMIN role may waive");

  console.log("\n[7] CC-10 — an instantiated checklist is immutable w.r.t. template evolution:");
  const preEditItemCount = (await getClosingChecklist(a.id, opp.id)).items.length;
  // Publish a new template revision: add an item and bump the version.
  await prisma.closingChecklistTemplateItem.create({
    data: { templateId: tmpl.id, organizationId: a.id, category: "DUE_DILIGENCE", label: "Survey review", required: true, completionEvidenceType: "DOCUMENT", position: 99 },
  });
  await prisma.closingChecklistTemplate.update({ where: { id: tmpl.id }, data: { version: 2 } });
  const existingAfterEdit = await getClosingChecklist(a.id, opp.id);
  assert(existingAfterEdit.items.length === preEditItemCount, "the already-instantiated checklist did NOT gain the new template item");
  assert(existingAfterEdit.templateVersion === 1, "the existing checklist still records the version it was born from (v1)");
  // A brand-new opportunity instantiated now reflects the evolved template.
  const opp2 = await mkOpp(a.id, (await mkProp(a.id, "Second Asset")).id, "Second Deal");
  const cl2 = await ensureClosingChecklist(a.id, opp2.id);
  assert(cl2.items.length === preEditItemCount + 1 && cl2.templateVersion === 2, "a newly instantiated checklist reflects the evolved template (v2, +1 item)");

  console.log("\n[8] Org scoping — a checklist/item is invisible and unwritable across orgs:");
  assert((await getClosingChecklist(b.id, opp.id)) === null, "org B cannot read org A's checklist");
  await throws(() => completeChecklistItem(b.id, required[0].id, actor.id), "org B cannot complete an org A item");
  await throws(() => waiveChecklistItem(b.id, required[0].id, actor.id, "nope"), "org B cannot waive an org A item");
  await throws(() => setItemOwner(b.id, required[0].id, actor.id), "org B cannot reassign an org A item");

  console.log("\n[9] Metadata — owner, due date, and Document evidence (CC-E):");
  const doc = await prisma.document.create({
    data: { organizationId: a.id, opportunityId: opp.id, title: "Title Report.pdf", documentType: "OTHER", storageKey: `${a.id}/title.pdf` },
  });
  const withOwner = await setItemOwner(a.id, required[0].id, actor.id);
  assert(withOwner.ownerId === actor.id, "an item owner can be assigned");
  const withDue = await setItemDueDate(a.id, required[0].id, new Date("2026-08-01T00:00:00.000Z"));
  assert(withDue.dueDate !== null, "an item due date can be set");
  const linked = await linkItemEvidence(a.id, required[0].id, { documentId: doc.id });
  assert(linked.evidenceDocumentId === doc.id, "a Document can be linked as evidence (scalar id, no FK — CC-E)");
  const unlinked = await linkItemEvidence(a.id, required[0].id, { documentId: null });
  assert(unlinked.evidenceDocumentId === null, "evidence can be cleared");
  const cleared = await setItemOwner(a.id, required[0].id, null);
  assert(cleared.ownerId === null, "an item owner can be unassigned");

  console.log("\n[10] Every state change is audited via ActivityLog (CC-B/CC-6):");
  const logs = await prisma.activityLog.findMany({ where: { organizationId: a.id, opportunityId: opp.id, eventType: { startsWith: "closing." } } });
  const types = new Set(logs.map((l) => l.eventType));
  assert(types.has("closing.item_completed"), "completion is audited");
  assert(types.has("closing.item_reopened"), "reopen is audited");
  assert(types.has("closing.item_waived"), "waive is audited");
  assert(types.has("closing.item_na"), "NOT_APPLICABLE is audited");
  const waiveLog = logs.find((l) => l.eventType === "closing.item_waived");
  assert(waiveLog.eventBody && waiveLog.eventBody.length > 0, "the waive audit entry carries the reason");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
