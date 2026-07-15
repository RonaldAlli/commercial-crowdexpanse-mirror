// Focused E2E for Property refresh through the shared orchestrator + the multi-
// entity registry-isolation regression (v1.2, Commit 2a-ii). Runs against the
// *_test DB with throwaway orgs. Uses the REAL runRefresh with propertyManualAdapter.
// Centerpieces: Property refresh flows through Observation→Signal→Projection with
// adapterVersion stamped, idempotency + value-grain NOOP, atomic rejection, org
// scoping — AND that a Property refresh and an Owner refresh never touch each
// other's projection, provenance, or refresh jobs (the registry is entity-scoped).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { createOwner } from "../lib/owners.ts";
import { propertyManualAdapter, PROPERTY_MANUAL_ADAPTER_VERSION } from "../lib/intelligence/sources/property-manual-adapter.ts";
import { manualAdapter } from "../lib/intelligence/sources/manual-adapter.ts";
import { runRefresh } from "../lib/intelligence/refresh.ts";
import { rebuildProperty } from "../lib/intelligence/property-projection.ts";
import { listRefreshJobsForEntity } from "../lib/refresh-jobs.ts";

const TAG = "e2e-property-refresh";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const pcol = async (id) => prisma.property.findUnique({ where: { id }, select: { yearBuilt: true, squareFeet: true } });
const ocol = async (id) => prisma.owner.findUnique({ where: { id }, select: { displayName: true } });
const op = (over = {}) => ({
  name: "Asset", assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null, ...over,
});
const ASOF = new Date("2026-06-01T00:00:00.000Z");
const pInput = (id, records, extra = {}) => ({ targetEntityType: "PROPERTY", targetEntityId: id, asOf: ASOF, records, ...extra });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Happy path — property refresh flows through Observation→Signal→Projection:");
  const p = await createPropertyRecord(a.id, op(), {});
  const job1 = await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "2001" }]));
  assert(job1.status === "SUCCEEDED" && job1.signalsAccepted === 1, "job SUCCEEDED, 1 signal accepted");
  assert((await pcol(p.id)).yearBuilt === 2001, "yearBuilt projected from the refresh");
  const sig = await prisma.intelligenceSignal.findFirst({ where: { organizationId: a.id, entityType: "PROPERTY", entityId: p.id, fieldKey: "yearBuilt", state: "ACCEPTED" } });
  assert(sig.sourceId === "manual:property" && sig.adapterVersion === PROPERTY_MANUAL_ADAPTER_VERSION, "signal stamped sourceId + adapterVersion");

  console.log("\n[2] Idempotency + value-grain NOOP:");
  const again = await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "2001" }]));
  assert(again.id === job1.id, "same requestKey returns the SAME job");
  const noop = await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "2001" }], { requestKey: "force-1" }));
  assert(noop.status === "NOOP" && noop.signalsAccepted === 0, "distinct requestKey but equal value → NOOP");

  console.log("\n[3] Atomic rejection — one invalid record fails the whole run; ledger untouched:");
  const failed = await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "2010" }, { fieldKey: "bogus", value: "x" }], { requestKey: "bad-1" }));
  assert(failed.status === "FAILED" && /rejected/.test(failed.error ?? ""), "invalid batch → FAILED with a reason");
  assert((await pcol(p.id)).yearBuilt === 2001, "projection unchanged by the failed run (no partial landing)");

  console.log("\n[4] Observational + org-scoped — never creates, never crosses orgs:");
  await throws(() => runRefresh(a.id, propertyManualAdapter, pInput("does-not-exist", [{ fieldKey: "yearBuilt", value: "1999" }])), "unknown target rejected");
  await throws(() => runRefresh(b.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "1999" }])), "cross-org refresh rejected");
  assert((await prisma.refreshJob.count({ where: { organizationId: b.id } })) === 0, "org B has no refresh jobs");

  console.log("\n[5] Multi-entity isolation — Owner refresh and Property refresh never touch each other:");
  const owner = await createOwner(a.id, { displayName: "Origin Owner LLC", entityType: "LLC" });
  await runRefresh(a.id, manualAdapter, { targetEntityType: "OWNER", targetEntityId: owner.id, asOf: ASOF, records: [{ fieldKey: "displayName", value: "Iso Owner LLC" }] });
  await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "squareFeet", value: "42000" }], { requestKey: "iso-p" }));
  assert((await ocol(owner.id)).displayName === "Iso Owner LLC", "owner projection correct after interleaved refresh");
  assert((await pcol(p.id)).squareFeet === 42000, "property projection correct after interleaved refresh");
  assert((await prisma.intelligenceSignal.count({ where: { entityId: p.id, entityType: "OWNER" } })) === 0, "no OWNER-typed signal exists on the property");
  assert((await prisma.intelligenceSignal.count({ where: { entityId: owner.id, entityType: "PROPERTY" } })) === 0, "no PROPERTY-typed signal exists on the owner");
  assert((await prisma.refreshJob.count({ where: { targetEntityId: p.id, targetEntityType: "OWNER" } })) === 0, "no OWNER-typed refresh job targets the property");
  assert((await prisma.refreshJob.count({ where: { targetEntityId: owner.id, targetEntityType: "PROPERTY" } })) === 0, "no PROPERTY-typed refresh job targets the owner");

  console.log("\n[6] 2b detail-page surface — history query, out-of-range rejection, refresh→reconstruction:");
  // (a) The exact history the Property detail page renders: newest-first, source-stamped.
  const hist = await listRefreshJobsForEntity(a.id, "PROPERTY", p.id);
  assert(hist.length > 0 && hist[0].sourceKey === "manual:property", "refresh history lists newest-first via manual:property");
  assert(hist.some((j) => j.id === job1.id), "the accepted refresh job appears in the entity history");
  // (b) An out-of-range year (the client min/max boundary) is rejected by normalization,
  //     so the run FAILS with a reason — never a silent projection change.
  const oor = await runRefresh(a.id, propertyManualAdapter, pInput(p.id, [{ fieldKey: "yearBuilt", value: "1500" }], { requestKey: "oor-1" }));
  assert(oor.status === "FAILED" && /1600 and 2100|rejected/.test(oor.error ?? ""), "out-of-range yearBuilt (1500) → FAILED with a range reason");
  assert((await pcol(p.id)).yearBuilt === 2001, "projection unchanged by the rejected out-of-range run");
  // (c) A refresh-driven signal reconstructs byte-for-byte (refresh shares the ledger write path).
  const liveP = await pcol(p.id);
  await prisma.property.update({ where: { id: p.id }, data: { yearBuilt: 1, squareFeet: 1 } });
  await rebuildProperty(a.id, p.id);
  assert(JSON.stringify(await pcol(p.id)) === JSON.stringify(liveP), "refresh-driven projection reconstructs from the ledger");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
