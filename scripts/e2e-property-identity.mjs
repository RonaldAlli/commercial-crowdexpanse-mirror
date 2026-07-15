// Focused E2E for Property identity (v1.2, Commit 2c-i — headless). Runs against
// the *_test DB with throwaway orgs. Proves: anchor projection with raw-preservation
// + reconstruction; the DERIVED PropertyIdentity index (winners + parcelKey +
// deterministic watermark) reconstructs and is content-idempotent (ZERO writes on a
// no-op rebuild, verified via Postgres xmin); anchor precedence; the immutable
// crosswalk (insert / idempotent / conflict / supersede-never-rewrite); org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord, updatePropertyRecord } from "../lib/properties.ts";
import { rebuildProperty } from "../lib/intelligence/property-projection.ts";
import { rebuildPropertyIdentity, parcelKeyOf, addPropertyExternalIdentifier, supersedePropertyExternalIdentifier } from "../lib/intelligence/property-identity.ts";
import { appendSignal } from "../lib/intelligence/provenance.ts";

const TAG = "e2e-property-identity";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const op = (over = {}) => ({
  name: "Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});
const anchorCols = (id) => prisma.property.findUnique({ where: { id }, select: { apnNormalized: true, countyFipsCode: true, addressNormalized: true } });
const idRow = (pid) => prisma.propertyIdentity.findUnique({ where: { propertyId: pid } });
const xmin = async (pid) => (await prisma.$queryRaw`SELECT xmin::text AS xmin FROM property_identities WHERE "propertyId" = ${pid}`)[0]?.xmin;
const strip = (r) => { const { id, ...rest } = r; return JSON.stringify(rest); }; // compare derived content, exclude surrogate id

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[0] parcelKeyOf — composite only when both anchors present:");
  assert(parcelKeyOf("13121", "12345678") === "13121|12345678", "parcelKey = FIPS|APN when both present");
  assert(parcelKeyOf(null, "12345678") === null && parcelKeyOf("13121", null) === null, "parcelKey null unless BOTH present");

  console.log("\n[1] Anchor projection — raw preserved, normalized projected, reconstructs:");
  const p = await createPropertyRecord(a.id, op(), { apnNormalized: "123-45-678", countyFipsCode: "13121", addressNormalized: "123 North Main Street" });
  let cols = await anchorCols(p.id);
  assert(cols.apnNormalized === "12345678" && cols.countyFipsCode === "13121" && cols.addressNormalized === "123 N MAIN ST", "anchors projected in normalized form");
  const apnSig = await prisma.intelligenceSignal.findFirst({ where: { organizationId: a.id, entityType: "PROPERTY", entityId: p.id, fieldKey: "apnNormalized", state: "ACCEPTED" } });
  assert(apnSig.valueRaw === "123-45-678" && apnSig.valueNormalized === "12345678", "ledger preserves RAW apn + normalized (invariant #3)");
  await prisma.property.update({ where: { id: p.id }, data: { apnNormalized: "X", countyFipsCode: "Y", addressNormalized: "Z" } });
  await rebuildProperty(a.id, p.id);
  cols = await anchorCols(p.id);
  assert(cols.apnNormalized === "12345678" && cols.countyFipsCode === "13121" && cols.addressNormalized === "123 N MAIN ST", "anchor columns reconstruct byte-for-byte from the ledger");

  console.log("\n[2] Derived PropertyIdentity index — winners + parcelKey + watermark; reconstructs:");
  let idx = await idRow(p.id);
  assert(idx.apnNormalized === "12345678" && idx.countyFipsCode === "13121" && idx.addressNormalized === "123 N MAIN ST", "index mirrors the winning anchors");
  assert(idx.parcelKey === "13121|12345678", "index parcelKey composed");
  assert(typeof idx.identityVersion === "string" && idx.identityVersion.length === 32, "index carries a deterministic identity fingerprint");
  assert(idx.rebuiltFromProjectionAt instanceof Date, "index carries a deterministic projection watermark");
  await prisma.propertyIdentity.update({ where: { propertyId: p.id }, data: { parcelKey: "WRONG", apnNormalized: "WRONG" } });
  await rebuildPropertyIdentity(a.id, p.id);
  idx = await idRow(p.id);
  assert(idx.parcelKey === "13121|12345678" && idx.apnNormalized === "12345678", "index reconstructs from the ledger");

  console.log("\n[3] Deterministic derivation (R2) — rebuild-from-scratch is identical (excl. surrogate id):");
  const before = await idRow(p.id);
  await prisma.propertyIdentity.delete({ where: { propertyId: p.id } });
  await rebuildPropertyIdentity(a.id, p.id);
  const after = await idRow(p.id);
  assert(strip(before) === strip(after), "identity derivation is deterministic (byte-for-byte identical)");

  console.log("\n[4] Idempotent rebuild (R4) — a no-op rebuild performs ZERO writes (xmin unchanged):");
  const x1 = await xmin(p.id);
  await rebuildPropertyIdentity(a.id, p.id);
  const x2 = await xmin(p.id);
  assert(x1 === x2, "second consecutive rebuild wrote nothing (Postgres xmin unchanged)");
  await updatePropertyRecord(a.id, p.id, op(), { apnNormalized: "999-99-999" });
  const x3 = await xmin(p.id);
  assert(x3 !== x2, "a genuine anchor change DOES rewrite the index (control)");
  assert((await idRow(p.id)).parcelKey === "13121|99999999", "index tracks the new winning APN");

  console.log("\n[5] Anchor precedence — USER_ENTERED beats an equal-dated PUBLIC anchor:");
  const asOf = new Date("2027-01-01");
  await appendSignal(a.id, { entityType: "PROPERTY", entityId: p.id, fieldKey: "apnNormalized", valueRaw: "111", valueNormalized: "111", sourceCategory: "PUBLIC", sourceId: "county", asOf, method: "import" });
  await appendSignal(a.id, { entityType: "PROPERTY", entityId: p.id, fieldKey: "apnNormalized", valueRaw: "222", valueNormalized: "222", sourceCategory: "USER_ENTERED", sourceId: "user", asOf, method: "manual" });
  await rebuildProperty(a.id, p.id);
  assert((await anchorCols(p.id)).apnNormalized === "222", "USER_ENTERED wins the same-asOf category tiebreak");
  assert((await idRow(p.id)).apnNormalized === "222", "index reflects the winning anchor after precedence");

  console.log("\n[6] Immutable crosswalk — insert / idempotent / conflict / supersede-never-rewrite (R3):");
  await addPropertyExternalIdentifier(a.id, p.id, "county", "PARCEL-1");
  await addPropertyExternalIdentifier(a.id, p.id, "county", "PARCEL-1"); // idempotent (same property)
  let rows = await prisma.propertyExternalIdentifier.findMany({ where: { organizationId: a.id, provider: "county", providerIdentifier: "PARCEL-1" } });
  assert(rows.length === 1 && rows[0].state === "ACTIVE" && rows[0].propertyId === p.id, "one ACTIVE crosswalk row after idempotent re-add");
  const p2 = await createPropertyRecord(a.id, op({ name: "Second" }), {});
  await throws(() => addPropertyExternalIdentifier(a.id, p2.id, "county", "PARCEL-1"), "mapping an existing provider id to a DIFFERENT property is rejected (no silent move)");
  await supersedePropertyExternalIdentifier(a.id, "county", "PARCEL-1", p2.id);
  rows = await prisma.propertyExternalIdentifier.findMany({ where: { organizationId: a.id, provider: "county", providerIdentifier: "PARCEL-1" } });
  const active = rows.filter((r) => r.state === "ACTIVE");
  const superseded = rows.filter((r) => r.state === "SUPERSEDED");
  assert(active.length === 1 && active[0].propertyId === p2.id, "exactly one ACTIVE row, now pointing to the new property");
  assert(superseded.length === 1 && superseded[0].propertyId === p.id, "prior mapping retained as SUPERSEDED (history never rewritten)");
  assert(superseded[0].supersededById === active[0].id, "supersession chain is recorded");

  console.log("\n[7] Org scoping — org B sees none of org A's identity/crosswalk:");
  assert((await prisma.propertyIdentity.count({ where: { organizationId: b.id } })) === 0, "org B has no PropertyIdentity rows");
  assert((await prisma.propertyExternalIdentifier.count({ where: { organizationId: b.id } })) === 0, "org B has no crosswalk rows");

  console.log("\n[8] Identity evolution — anchor supersession flips the fingerprint; crosswalk untouched; converges:");
  const p3 = await createPropertyRecord(a.id, op({ name: "Evolve" }), { apnNormalized: "AAA-111", countyFipsCode: "13121", addressNormalized: "1 First St" });
  const fp1 = (await idRow(p3.id)).identityVersion;
  await addPropertyExternalIdentifier(a.id, p3.id, "vendorX", "VX-1");
  const xwalkBefore = JSON.stringify(await prisma.propertyExternalIdentifier.findMany({ where: { organizationId: a.id, propertyId: p3.id }, orderBy: { id: "asc" } }));
  // Supersede the APN anchor with a new USER_ENTERED value (a real identity change).
  await updatePropertyRecord(a.id, p3.id, op({ name: "Evolve" }), { apnNormalized: "BBB-222" });
  const idx3 = await idRow(p3.id);
  assert(idx3.identityVersion !== fp1, "identity fingerprint changes when a strong anchor is superseded");
  assert(idx3.apnNormalized === "BBB222" && idx3.parcelKey === "13121|BBB222", "index tracks the new winning anchor");
  // Reconstruction remains deterministic after evolution.
  const snap = await idRow(p3.id);
  await prisma.propertyIdentity.delete({ where: { propertyId: p3.id } });
  await rebuildPropertyIdentity(a.id, p3.id);
  assert(strip(snap) === strip(await idRow(p3.id)), "reconstruction remains deterministic after evolution");
  // Anchor evolution never touches the crosswalk.
  const xwalkAfter = JSON.stringify(await prisma.propertyExternalIdentifier.findMany({ where: { organizationId: a.id, propertyId: p3.id }, orderBy: { id: "asc" } }));
  assert(xwalkAfter === xwalkBefore, "crosswalk unchanged by anchor supersession");
  // Rebuild is idempotent after convergence (zero writes).
  const xc = await xmin(p3.id);
  await rebuildPropertyIdentity(a.id, p3.id);
  assert((await xmin(p3.id)) === xc, "rebuild is idempotent after convergence (zero writes)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
