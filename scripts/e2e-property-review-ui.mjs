// Focused E2E for the Property identity review/resolution UI data contracts (v1.2,
// Commit 2c-iii). The pages + server actions are thin consumers of the already-tested
// engine; this verifies the exact read/decision shapes those surfaces depend on:
// the candidate queue + decision lists (candidates page), pairContext + record/reopen
// (confirm/dismiss/reopen actions), and the resolution-audit + crosswalk + reversal
// reads (identity detail page). No React rendering — the data contracts only.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord, updatePropertyRecord } from "../lib/properties.ts";
import { resolveOrCreateProperty, reversePropertyResolution } from "../lib/intelligence/property-resolver.ts";
import {
  generatePropertyCandidateQueue,
  listPropertyDecisions,
  pairContextProperty,
  recordPropertyMatchDecision,
  reopenPropertyMatchDecision,
} from "../lib/property-match.ts";

const TAG = "e2e-property-review-ui";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }
const op = (over = {}) => ({
  name: "Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});
const inQueue = async (org, x, y) => (await generatePropertyCandidateQueue(org)).pending.some((p) => (p.propertyIdA === x && p.propertyIdB === y) || (p.propertyIdA === y && p.propertyIdB === x));
const hasDecision = (list, x, y) => list.decisions.some((d) => (d.propertyIdA === x && d.propertyIdB === y) || (d.propertyIdA === y && d.propertyIdB === x));

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);

  console.log("\n[1] Candidate queue contract (candidates page — pending tab):");
  const t = await createPropertyRecord(a.id, op({ name: "T" }), { addressNormalized: "5 Fifth Ave", countyFipsCode: "13005" });
  const r = await resolveOrCreateProperty(a.id, op({ name: "AddrMate" }), { addressNormalized: "5 Fifth Ave", countyFipsCode: "13005" }, { actorUserId: "u1" });
  const v = r.property;
  const q = await generatePropertyCandidateQueue(a.id);
  const item = q.pending.find((p) => (p.propertyIdA === v.id && p.propertyIdB === t.id) || (p.propertyIdA === t.id && p.propertyIdB === v.id));
  assert(!!item, "the queue surfaces the new proposal pair");
  assert(item && typeof item.id === "string" && item.basis === "ADDRESS_PROPOSAL" && item.status === "PENDING", "queue item carries {id, basis, status} the page renders");

  console.log("\n[2] Confirm action contract (pairContext → record → confirmed list):");
  const ctx = await pairContextProperty(a.id, v.id, t.id);
  assert(ctx.propertyIdA < ctx.propertyIdB && typeof ctx.fingerprint === "string" && ctx.fingerprint.length === 32 && ctx.basis === "ADDRESS_PROPOSAL", "pairContext returns canonical pair + basis + 32-char fingerprint");
  await recordPropertyMatchDecision(a.id, { ...ctx, status: "CONFIRMED", decidedByUserId: "u1" });
  assert(hasDecision(await listPropertyDecisions(a.id, "CONFIRMED"), v.id, t.id), "confirmed pair appears in the Confirmed tab");
  assert(!(await inQueue(a.id, v.id, t.id)), "confirmed pair leaves the pending queue");

  console.log("\n[3] Dismiss + reopen contract (dismissed tab, ADMIN reopen):");
  const u = await createPropertyRecord(a.id, op({ name: "U" }), { addressNormalized: "8 Eighth Ln", countyFipsCode: "13008" });
  const r2 = await resolveOrCreateProperty(a.id, op({ name: "W" }), { addressNormalized: "8 Eighth Ln", countyFipsCode: "13008" }, { actorUserId: "u1" });
  const w = r2.property;
  const ctx2 = await pairContextProperty(a.id, w.id, u.id);
  await recordPropertyMatchDecision(a.id, { ...ctx2, status: "DISMISSED", decidedByUserId: "u1" });
  assert(hasDecision(await listPropertyDecisions(a.id, "DISMISSED"), w.id, u.id), "dismissed pair appears in the Dismissed tab");
  assert(!(await inQueue(a.id, w.id, u.id)), "dismissed pair is suppressed from the pending queue");
  await reopenPropertyMatchDecision(a.id, w.id, u.id, "admin1");
  assert(await inQueue(a.id, w.id, u.id), "ADMIN reopen returns the pair to the pending queue");
  assert(!hasDecision(await listPropertyDecisions(a.id, "DISMISSED"), w.id, u.id), "a reopened pair leaves the Dismissed tab (reopenedAt excludes it)");

  console.log("\n[4] Identity detail contract (audit history + crosswalk + reversal):");
  const p = await createPropertyRecord(a.id, op({ name: "P" }), { apnNormalized: "FFF666", countyFipsCode: "13011" });
  await resolveOrCreateProperty(a.id, op(), { apnNormalized: "FFF666", countyFipsCode: "13011" }, { externalIds: [{ provider: "ATTOM", providerIdentifier: "PX" }], actorUserId: "u1" });
  const resolveEv = await prisma.propertyResolution.findFirst({ where: { organizationId: a.id, kind: "RESOLVE", resolvedPropertyId: p.id } });
  assert(resolveEv && resolveEv.basis === "UNIQUE_PARCEL", "identity page reads a RESOLVE event with its basis");
  const xwalk = await prisma.propertyExternalIdentifier.findMany({ where: { organizationId: a.id, propertyId: p.id } });
  assert(xwalk.length === 1 && xwalk[0].state === "ACTIVE", "identity page reads the active crosswalk row");
  const reversal = await reversePropertyResolution(a.id, resolveEv.id, { actorUserId: "admin1", reason: "mis-attached" });
  const events = await prisma.propertyResolution.findMany({ where: { organizationId: a.id, resolvedPropertyId: p.id }, orderBy: { createdAt: "desc" } });
  const reversedIds = new Set(events.filter((e) => e.kind === "REVERSAL" && e.supersedesResolutionId).map((e) => e.supersedesResolutionId));
  assert(reversedIds.has(resolveEv.id), "reversedResolveIds (page logic) marks the RESOLVE as reversed → Reverse control hidden");
  assert((await prisma.propertyResolution.findUnique({ where: { id: resolveEv.id } })).kind === "RESOLVE", "the original RESOLVE event is unchanged (history preserved)");
  const revokedRow = await prisma.propertyExternalIdentifier.findUnique({ where: { id: xwalk[0].id } });
  assert(revokedRow.state === "SUPERSEDED" && revokedRow.revokedByResolutionId === reversal.id, "identity page shows the attachment as Revoked after reversal");
  const cands = await prisma.propertyMatchDecision.findMany({ where: { organizationId: a.id, OR: [{ propertyIdA: p.id }, { propertyIdB: p.id }] } });
  assert(cands.length === 0, "a cleanly-resolved property has no competing candidates");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
