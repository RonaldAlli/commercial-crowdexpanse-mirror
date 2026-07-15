// Focused E2E for ledger-backed Property projection (v1.2, Commit 2a-ii).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// lib/properties domain writes + lib/intelligence/property-projection. Centerpiece:
// the Projection Reconstruction Standard — rebuildProperty() reproduces the live
// projection byte-for-byte from the ledger. Also proves ledger-native create,
// supersede + reproject, value-grain skip, precedence, genesis backfill, and org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord, updatePropertyRecord, backfillPropertyGenesisSignals } from "../lib/properties.ts";
import { rebuildProperty, recomputePropertyField } from "../lib/intelligence/property-projection.ts";
import { appendSignal } from "../lib/intelligence/provenance.ts";

const TAG = "e2e-property-projection";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const col = async (id) => prisma.property.findUnique({ where: { id }, select: { yearBuilt: true, squareFeet: true } });
const sigCount = (orgId, id, extra = {}) =>
  prisma.intelligenceSignal.count({ where: { organizationId: orgId, entityType: "PROPERTY", entityId: id, state: "ACCEPTED", ...extra } });
const op = (over = {}) => ({
  name: "Test Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Ledger-native create — projected columns are backed by signals:");
  const p = await createPropertyRecord(a.id, op(), { yearBuilt: 1998, squareFeet: 50000 });
  assert(p.yearBuilt === 1998 && p.squareFeet === 50000, "yearBuilt + squareFeet projected on create");
  assert((await sigCount(a.id, p.id)) === 2, "two accepted genesis signals (yearBuilt + squareFeet)");

  console.log("\n[2] Update — supersede + reproject; value-grain skip on an unchanged save:");
  await updatePropertyRecord(a.id, p.id, op(), { yearBuilt: 2005, squareFeet: 50000 });
  assert((await col(p.id)).yearBuilt === 2005, "yearBuilt reprojected to the new value");
  assert((await sigCount(a.id, p.id, { fieldKey: "yearBuilt" })) === 1, "one ACCEPTED yearBuilt signal (prior superseded)");
  const before = await sigCount(a.id, p.id);
  await updatePropertyRecord(a.id, p.id, op(), { yearBuilt: 2005, squareFeet: 50000 });
  assert((await sigCount(a.id, p.id)) === before, "unchanged save writes NO new signal (value-grain skip)");

  console.log("\n[3] Precedence — a USER_ENTERED value wins over an equal-dated PUBLIC signal:");
  const asOf = new Date("2027-01-01");
  await appendSignal(a.id, { entityType: "PROPERTY", entityId: p.id, fieldKey: "yearBuilt", valueRaw: "1900", valueNormalized: "1900", sourceCategory: "PUBLIC", sourceId: "county", asOf, method: "import" });
  await appendSignal(a.id, { entityType: "PROPERTY", entityId: p.id, fieldKey: "yearBuilt", valueRaw: "1975", valueNormalized: "1975", sourceCategory: "USER_ENTERED", sourceId: "user", asOf, method: "manual" });
  await recomputePropertyField(a.id, p.id, "yearBuilt");
  assert((await col(p.id)).yearBuilt === 1975, "USER_ENTERED wins over same-asOf PUBLIC (category tiebreak)");

  console.log("\n[4] Reconstruction Standard — rebuildProperty reproduces the live projection byte-for-byte:");
  const live = await col(p.id);
  await prisma.property.update({ where: { id: p.id }, data: { yearBuilt: 1234, squareFeet: 1 } });
  await rebuildProperty(a.id, p.id);
  assert(JSON.stringify(await col(p.id)) === JSON.stringify(live), "rebuilt projection identical to the pre-corruption live projection");

  console.log("\n[5] Genesis backfill — pre-ledger columns become ledger-backed (idempotent):");
  const legacy = await prisma.property.create({ data: { organizationId: a.id, ...op({ name: "Legacy" }), yearBuilt: 1965, squareFeet: 12000 } });
  assert((await sigCount(a.id, legacy.id)) === 0, "legacy property starts with no signals");
  await backfillPropertyGenesisSignals(a.id);
  assert((await sigCount(a.id, legacy.id)) === 2, "backfill seeds genesis signals for the legacy property");
  const liveLegacy = await col(legacy.id);
  await prisma.property.update({ where: { id: legacy.id }, data: { yearBuilt: 1, squareFeet: 1 } });
  await rebuildProperty(a.id, legacy.id);
  assert(JSON.stringify(await col(legacy.id)) === JSON.stringify(liveLegacy), "backfilled legacy property reconstructs from the ledger");
  const r2 = await backfillPropertyGenesisSignals(a.id);
  assert(r2.backfilled === 0, "backfill is idempotent (second run seeds nothing)");

  console.log("\n[6] No direct projection writes + org scoping:");
  assert((await sigCount(a.id, p.id, { fieldKey: "squareFeet" })) >= 1, "projected columns always leave a signal trail");
  await throws(() => updatePropertyRecord(b.id, p.id, op(), { yearBuilt: 2000, squareFeet: 50000 }), "cross-org update rejected");
  assert((await prisma.intelligenceSignal.count({ where: { organizationId: b.id } })) === 0, "org B has no signals");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
