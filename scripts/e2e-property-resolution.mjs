// Focused E2E for Property identity RESOLUTION (v1.2, Commit 2c-ii — headless). Runs
// against the *_test DB with throwaway orgs. Proves the guarded deterministic
// resolve-before-create engine end-to-end: Tier 1A (unique parcel / unique external
// id) resolves without creating a duplicate + records an audit event; Tier 1B/2 create
// a new property + review candidates; enrichment appends observations with preserved
// provenance (never mutating evidence); candidate suppression + material-change
// resurfacing + ADMIN reopen; confirm records a decision ONLY; requestKey idempotency;
// reversal as a first-class append-only event that revokes crosswalk attachments;
// org scoping; Owner untouched.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord, updatePropertyRecord } from "../lib/properties.ts";
import { rebuildProperty } from "../lib/intelligence/property-projection.ts";
import { addPropertyExternalIdentifier } from "../lib/intelligence/property-identity.ts";
import { resolveOrCreateProperty, reversePropertyResolution } from "../lib/intelligence/property-resolver.ts";
import {
  generatePropertyCandidateQueue,
  recordPropertyMatchDecision,
  reopenPropertyMatchDecision,
  pairContextProperty,
  listPropertyDecisions,
} from "../lib/property-match.ts";

const TAG = "e2e-property-resolution";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const op = (over = {}) => ({
  name: "Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});
const propCount = (orgId) => prisma.property.count({ where: { organizationId: orgId } });
const resolveEvents = (orgId, resolvedPropertyId) => prisma.propertyResolution.count({ where: { organizationId: orgId, kind: "RESOLVE", resolvedPropertyId } });
const inQueue = (q, x, y) => q.pending.some((p) => (p.propertyIdA === x && p.propertyIdB === y) || (p.propertyIdA === y && p.propertyIdB === x));

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Tier 1A — unique conflict-free parcel resolves (no duplicate) + RESOLVE audit:");
  const p1 = await createPropertyRecord(a.id, op(), { apnNormalized: "AAA-111", countyFipsCode: "13001", addressNormalized: "1 First St" });
  const before1 = await propCount(a.id);
  const r1 = await resolveOrCreateProperty(a.id, op({ name: "Dup of P1" }), { apnNormalized: "AAA111", countyFipsCode: "13001", addressNormalized: "1 First St" }, { actorUserId: "u1" });
  assert(r1.resolved === true && r1.property.id === p1.id, "resolved to the existing property (parcel match, normalization-tolerant)");
  assert(r1.outcome.basis === "UNIQUE_PARCEL", "outcome basis is UNIQUE_PARCEL");
  assert((await propCount(a.id)) === before1, "no new property row was created (resolve-before-create)");
  assert((await resolveEvents(a.id, p1.id)) === 1, "a single RESOLVE audit event was recorded");

  console.log("\n[2] Tier 1A — unique external identifier resolves (UNIQUE_EXTERNAL_IDENTIFIER):");
  const q = await createPropertyRecord(a.id, op({ name: "Q" }), { addressNormalized: "2 Second St", countyFipsCode: "13002" });
  await addPropertyExternalIdentifier(a.id, q.id, "ATTOM", "Q-1");
  const r2 = await resolveOrCreateProperty(a.id, op({ name: "Dup of Q" }), {}, { externalIds: [{ provider: "ATTOM", providerIdentifier: "Q-1" }], actorUserId: "u1" });
  assert(r2.resolved === true && r2.property.id === q.id, "resolved to the property the external id maps to");
  assert(r2.outcome.basis === "UNIQUE_EXTERNAL_IDENTIFIER", "outcome basis is UNIQUE_EXTERNAL_IDENTIFIER");

  console.log("\n[3] Tier 1B — Decision A downgrade: parcel and external id disagree ⇒ candidates:");
  const r3a = await createPropertyRecord(a.id, op({ name: "R1" }), { apnNormalized: "BBB222", countyFipsCode: "13003" });
  const r3b = await createPropertyRecord(a.id, op({ name: "R2" }), { addressNormalized: "3 Third St", countyFipsCode: "13003b" });
  await addPropertyExternalIdentifier(a.id, r3b.id, "ATTOM", "R2X");
  const before3 = await propCount(a.id);
  const r3 = await resolveOrCreateProperty(a.id, op({ name: "Conflicted" }), { apnNormalized: "BBB222", countyFipsCode: "13003" }, { externalIds: [{ provider: "ATTOM", providerIdentifier: "R2X" }], actorUserId: "u1" });
  assert(r3.resolved === false, "did NOT auto-resolve (conflicting authoritative evidence)");
  assert(r3.outcome.tier === "1B" && r3.outcome.basis === "PARCEL_CONFLICT", "classified Tier 1B / PARCEL_CONFLICT");
  assert((await propCount(a.id)) === before3 + 1, "a new canonical property was created (never auto-attached)");
  const q3 = await generatePropertyCandidateQueue(a.id);
  assert(inQueue(q3, r3.property.id, r3a.id) && inQueue(q3, r3.property.id, r3b.id), "review candidates raised against BOTH conflicting properties");

  console.log("\n[4] Tier 1B — two properties share a parcel key (ambiguity) ⇒ candidates:");
  const s1 = await createPropertyRecord(a.id, op({ name: "S1" }), { apnNormalized: "CCC333", countyFipsCode: "13004" });
  const s2 = await createPropertyRecord(a.id, op({ name: "S2" }), { apnNormalized: "CCC333", countyFipsCode: "13004" });
  const r4 = await resolveOrCreateProperty(a.id, op({ name: "AmbiguousParcel" }), { apnNormalized: "CCC333", countyFipsCode: "13004" }, { actorUserId: "u1" });
  assert(r4.resolved === false && r4.outcome.tier === "1B", "ambiguous parcel does not resolve (Tier 1B)");
  const q4 = await generatePropertyCandidateQueue(a.id);
  assert(inQueue(q4, r4.property.id, s1.id) && inQueue(q4, r4.property.id, s2.id), "candidates raised against both parcel-sharing properties");

  console.log("\n[5] Tier 2 — in-jurisdiction address agreement ⇒ proposal-only candidate:");
  const t = await createPropertyRecord(a.id, op({ name: "T" }), { addressNormalized: "5 Fifth Ave", countyFipsCode: "13005" });
  const r5 = await resolveOrCreateProperty(a.id, op({ name: "AddrMate" }), { addressNormalized: "5 Fifth Ave", countyFipsCode: "13005" }, { actorUserId: "u1" });
  assert(r5.resolved === false && r5.outcome.tier === "2" && r5.outcome.basis === "ADDRESS_PROPOSAL", "address agreement is a Tier 2 proposal");
  const q5 = await generatePropertyCandidateQueue(a.id);
  assert(inQueue(q5, r5.property.id, t.id), "proposal candidate raised for the address mate");

  console.log("\n[6] NONE — no identity match ⇒ ordinary create, no candidate, no resolution event:");
  const before6 = await propCount(a.id);
  const resBefore6 = await prisma.propertyResolution.count({ where: { organizationId: a.id } });
  const r6 = await resolveOrCreateProperty(a.id, op({ name: "Fresh" }), { apnNormalized: "ZZZ999", countyFipsCode: "13006", addressNormalized: "6 Sixth Way" }, { actorUserId: "u1" });
  assert(r6.resolved === false && r6.outcome.tier === "NONE", "no match ⇒ Tier NONE, new property");
  assert((await propCount(a.id)) === before6 + 1, "exactly one new property created");
  assert((await prisma.propertyResolution.count({ where: { organizationId: a.id } })) === resBefore6, "NONE writes no resolution event");
  assert((await prisma.propertyMatchDecision.count({ where: { organizationId: a.id, OR: [{ propertyIdA: r6.property.id }, { propertyIdB: r6.property.id }] } })) === 0, "NONE raises no candidate");

  console.log("\n[7] Enrichment — Tier 1A records inbound anchors as APPENDED observations, provenance preserved:");
  const p7 = await createPropertyRecord(a.id, op({ name: "P7" }), { apnNormalized: "DDD444", countyFipsCode: "13007", addressNormalized: "7 Old Rd" });
  const obsBefore7 = await prisma.observation.count({ where: { organizationId: a.id, entityId: p7.id } });
  await resolveOrCreateProperty(a.id, op({ name: "Enricher" }), { apnNormalized: "DDD444", countyFipsCode: "13007", addressNormalized: "7 New Rd" },
    { sourceCategory: "PUBLIC", sourceId: "attom", asOf: new Date("2026-01-02T00:00:00Z"), actorUserId: "u1" });
  const obsAfter7 = await prisma.observation.count({ where: { organizationId: a.id, entityId: p7.id } });
  assert(obsAfter7 > obsBefore7, "enrichment APPENDED new observation(s) to the resolved property");
  const enriched = await prisma.observation.findFirst({ where: { organizationId: a.id, entityId: p7.id, fieldKey: "addressNormalized", sourceCategory: "PUBLIC" } });
  assert(enriched && enriched.valueRaw === "7 New Rd", "enrichment observation retained its ORIGINAL source metadata (PUBLIC)");
  await rebuildProperty(a.id, p7.id);
  const p7cols = await prisma.property.findUnique({ where: { id: p7.id }, select: { addressNormalized: true } });
  assert(typeof p7cols.addressNormalized === "string", "resolved property reconstructs deterministically from the ledger after enrichment");

  console.log("\n[8] Candidate suppression + material-change resurfacing + ADMIN reopen:");
  const u = await createPropertyRecord(a.id, op({ name: "U" }), { addressNormalized: "8 Eighth Ln", countyFipsCode: "13008" });
  const r8 = await resolveOrCreateProperty(a.id, op({ name: "V" }), { addressNormalized: "8 Eighth Ln", countyFipsCode: "13008" }, { actorUserId: "u1" });
  const v = r8.property;
  assert(inQueue(await generatePropertyCandidateQueue(a.id), v.id, u.id), "the (V,U) proposal is initially pending");
  const ctx = await pairContextProperty(a.id, v.id, u.id);
  await recordPropertyMatchDecision(a.id, { ...ctx, status: "DISMISSED", decidedByUserId: "u1" });
  assert(!inQueue(await generatePropertyCandidateQueue(a.id), v.id, u.id), "a DISMISSED pair is suppressed from the queue");
  // Materially change U's identity (new address anchor) → fingerprint drifts → resurface.
  await updatePropertyRecord(a.id, u.id, op(), { addressNormalized: "8 Eighth Lane Rebuilt" }, { actorUserId: "u1" });
  assert(inQueue(await generatePropertyCandidateQueue(a.id), v.id, u.id), "a material identity change RESURFACES the dismissed pair");
  // Dismiss again at the new fingerprint, then ADMIN reopen forces it back to pending.
  const ctx2 = await pairContextProperty(a.id, v.id, u.id);
  await recordPropertyMatchDecision(a.id, { ...ctx2, status: "DISMISSED", decidedByUserId: "u1" });
  assert(!inQueue(await generatePropertyCandidateQueue(a.id), v.id, u.id), "re-dismissed at the new fingerprint (suppressed again)");
  await reopenPropertyMatchDecision(a.id, v.id, u.id, "admin1");
  assert(inQueue(await generatePropertyCandidateQueue(a.id), v.id, u.id), "explicit ADMIN reopen returns the pair to pending");

  console.log("\n[9] Confirm records a DECISION ONLY — no merge/create/delete, no evidence written:");
  const propC = await propCount(a.id);
  const sigC = await prisma.intelligenceSignal.count({ where: { organizationId: a.id } });
  const obsC = await prisma.observation.count({ where: { organizationId: a.id } });
  const xwalkC = await prisma.propertyExternalIdentifier.count({ where: { organizationId: a.id } });
  const ctx9 = await pairContextProperty(a.id, r5.property.id, t.id);
  const dec9 = await recordPropertyMatchDecision(a.id, { ...ctx9, status: "CONFIRMED", decidedByUserId: "u1" });
  assert(dec9.status === "CONFIRMED", "the decision is recorded as CONFIRMED");
  assert((await propCount(a.id)) === propC, "confirm created/deleted no property (no structural merge)");
  assert((await prisma.intelligenceSignal.count({ where: { organizationId: a.id } })) === sigC, "confirm wrote no Signal");
  assert((await prisma.observation.count({ where: { organizationId: a.id } })) === obsC, "confirm wrote no Observation");
  assert((await prisma.propertyExternalIdentifier.count({ where: { organizationId: a.id } })) === xwalkC, "confirm touched no crosswalk row");
  const confirmedList = await listPropertyDecisions(a.id, "CONFIRMED");
  assert(confirmedList.total >= 1, "the confirmed decision feeds a merge queue (deferred merge)");

  console.log("\n[10] Idempotency — a repeated resolve with the same requestKey does not double-write:");
  await createPropertyRecord(a.id, op({ name: "P10" }), { apnNormalized: "EEE555", countyFipsCode: "13010" });
  const k = `req-${process.pid}`;
  const r10a = await resolveOrCreateProperty(a.id, op(), { apnNormalized: "EEE555", countyFipsCode: "13010" }, { requestKey: k, actorUserId: "u1" });
  const r10b = await resolveOrCreateProperty(a.id, op(), { apnNormalized: "EEE555", countyFipsCode: "13010" }, { requestKey: k, actorUserId: "u1" });
  assert(r10a.property.id === r10b.property.id, "replay returns the same resolved property");
  assert((await prisma.propertyResolution.count({ where: { organizationId: a.id, requestKey: k } })) === 1, "the requestKey recorded exactly one RESOLVE event");

  console.log("\n[11] Reversal is a first-class append-only event that revokes attachments; evidence untouched:");
  const p11 = await createPropertyRecord(a.id, op({ name: "P11" }), { apnNormalized: "FFF666", countyFipsCode: "13011" });
  const obsSnapshot = await prisma.observation.findMany({ where: { organizationId: a.id, entityId: p11.id }, select: { id: true, valueRaw: true, valueNormalized: true } });
  await resolveOrCreateProperty(a.id, op(), { apnNormalized: "FFF666", countyFipsCode: "13011" }, { externalIds: [{ provider: "ATTOM", providerIdentifier: "P11X" }], actorUserId: "u1" });
  const resolveEv = await prisma.propertyResolution.findFirst({ where: { organizationId: a.id, kind: "RESOLVE", resolvedPropertyId: p11.id } });
  const attachedId = (Array.isArray(resolveEv.attachedExternalIdentifierIds) ? resolveEv.attachedExternalIdentifierIds : [])[0];
  assert(!!attachedId, "the RESOLVE event recorded the crosswalk id it attached");
  const reversal = await reversePropertyResolution(a.id, resolveEv.id, { actorUserId: "admin1", reason: "mis-attached" });
  assert(reversal.kind === "REVERSAL" && reversal.supersedesResolutionId === resolveEv.id, "a REVERSAL event supersedes the original RESOLVE");
  assert(reversal.actorUserId === "admin1" && reversal.reason === "mis-attached", "the reversal records actor + reason (first-class event)");
  const revokedRow = await prisma.propertyExternalIdentifier.findUnique({ where: { id: attachedId } });
  assert(revokedRow.state === "SUPERSEDED" && revokedRow.revokedByResolutionId === reversal.id, "the attachment is revoked (ACTIVE→SUPERSEDED), attributed to the reversal");
  const originalStill = await prisma.propertyResolution.findUnique({ where: { id: resolveEv.id } });
  assert(originalStill.kind === "RESOLVE", "the original RESOLVE event is never mutated");
  // Resolution never modifies evidence: every prior observation still present, unchanged.
  let evidenceIntact = obsSnapshot.length > 0;
  for (const o of obsSnapshot) {
    const now = await prisma.observation.findUnique({ where: { id: o.id } });
    if (!now || now.valueRaw !== o.valueRaw || now.valueNormalized !== o.valueNormalized) evidenceIntact = false;
  }
  assert(evidenceIntact, "resolution + reversal modified NO prior evidence (observations intact)");
  const reversalAgain = await reversePropertyResolution(a.id, resolveEv.id, { actorUserId: "admin1" });
  assert(reversalAgain.id === reversal.id, "reversal is idempotent (no second REVERSAL event)");

  console.log("\n[12] Org scoping — identical parcel evidence never crosses org boundaries:");
  const aG = await createPropertyRecord(a.id, op({ name: "aG" }), { apnNormalized: "GGG777", countyFipsCode: "13013" });
  const bG = await createPropertyRecord(b.id, op({ name: "bG" }), { apnNormalized: "GGG777", countyFipsCode: "13013" });
  const bPropsBefore = await propCount(b.id);
  const rOrg = await resolveOrCreateProperty(a.id, op(), { apnNormalized: "GGG777", countyFipsCode: "13013" }, { actorUserId: "u1" });
  assert(rOrg.resolved === true && rOrg.property.id === aG.id, "resolve in org A matched only org A's property");
  assert(rOrg.property.id !== bG.id, "org B's identical-parcel property was invisible to org A");
  assert((await propCount(b.id)) === bPropsBefore, "org B was untouched by org A's resolution");

  console.log("\n[13] Owner state untouched — property resolution never leaks into the Owner domain:");
  assert((await prisma.owner.count({ where: { organizationId: a.id } })) === 0, "no Owner rows created by property resolution");
  assert((await prisma.ownerMatchDecision.count({ where: { organizationId: a.id } })) === 0, "no OwnerMatchDecision rows created by property resolution");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
