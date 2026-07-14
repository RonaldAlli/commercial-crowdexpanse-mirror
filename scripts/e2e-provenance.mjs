// Focused E2E for the provenance ledger (v1.2, Commit 1b-1).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// lib/intelligence/provenance data-access. Proves: observation → signal append,
// supersession within a lineage (immutable — prior kept SUPERSEDED), coexistence
// across lineages, the read API, genesis backfill (idempotent), and org scoping.
// Projection/precedence is Commit 1b-2 and NOT exercised here.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner } from "../lib/owners.ts";
import {
  acceptObservationAsSignal,
  appendSignal,
  backfillOwnerGenesisSignals,
  getFieldProvenance,
  getFieldSignals,
  recordObservation,
} from "../lib/intelligence/provenance.ts";

const TAG = "e2e-provenance";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) {
  try { await fn(); assert(false, msg); } catch { assert(true, msg); }
}
const D = (s) => new Date(`2026-0${s}`);

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const owner = await createOwner(a.id, { displayName: "Ledger Test LLC", entityType: "LLC" });
  const ref = { entityType: "OWNER", entityId: owner.id, fieldKey: "displayName" };

  console.log("\n[1] Append a signal (observation → accepted signal):");
  const s1 = await appendSignal(a.id, { ...ref, valueRaw: "Ledger Test LLC", valueNormalized: "LEDGER TEST LLC", sourceCategory: "USER_ENTERED", sourceId: "user-1", asOf: D("1-01"), method: "manual" });
  assert(s1.state === "ACCEPTED", "signal is ACCEPTED");
  assert(s1.schemaVersion >= 1 && s1.normalizationVersion >= 1 && s1.projectionVersion >= 1, "signal is version-stamped");
  assert((await prisma.observation.count({ where: { organizationId: a.id } })) === 1, "one observation recorded");

  console.log("\n[2] Supersession within a lineage — new value supersedes prior, prior persists:");
  const s2 = await appendSignal(a.id, { ...ref, valueRaw: "Ledger Test Holdings LLC", sourceCategory: "USER_ENTERED", sourceId: "user-1", asOf: D("2-01"), method: "manual" });
  const s1After = await prisma.intelligenceSignal.findUnique({ where: { id: s1.id } });
  assert(s1After.state === "SUPERSEDED" && s1After.supersededById === s2.id, "prior signal marked SUPERSEDED, points to the new one");
  assert(s2.state === "ACCEPTED", "new signal is the ACCEPTED current");
  const accepted = (await getFieldSignals(a.id, ref)).filter((s) => s.state === "ACCEPTED");
  assert(accepted.length === 1 && accepted[0].id === s2.id, "exactly one ACCEPTED in the lineage (the latest)");

  console.log("\n[3] Immutability — the ledger is append-only (superseded rows are never deleted):");
  assert((await prisma.intelligenceSignal.count({ where: { entityId: owner.id, fieldKey: "displayName" } })) === 2, "both signals persist (1 SUPERSEDED + 1 ACCEPTED)");

  console.log("\n[4] Cross-lineage coexistence — a second source does not supersede the first:");
  const sPub = await appendSignal(a.id, { ...ref, valueRaw: "LEDGER TEST LLC (public)", sourceCategory: "PUBLIC", sourceId: "county", asOf: D("3-01"), method: "import" });
  const prov = await getFieldProvenance(a.id, ref);
  assert(prov.accepted.length === 2, "two ACCEPTED signals coexist (USER_ENTERED + PUBLIC lineages)");
  assert(prov.supersededCount === 1 && prov.total === 3, "read API reports 1 superseded, 3 total");
  assert((await prisma.intelligenceSignal.findUnique({ where: { id: s2.id } })).state === "ACCEPTED", "USER_ENTERED signal untouched by the PUBLIC one");

  console.log("\n[5] Accept guards:");
  const orphanObs = await recordObservation(a.id, { ...ref, valueRaw: "x", sourceCategory: "USER_ENTERED", sourceId: "user-1", asOf: D("4-01"), method: "manual" });
  await acceptObservationAsSignal(a.id, orphanObs.id);
  await throws(() => acceptObservationAsSignal(a.id, orphanObs.id), "accepting the same observation twice is rejected");
  await throws(() => acceptObservationAsSignal(b.id, orphanObs.id), "cross-org accept rejected");

  console.log("\n[6] Genesis backfill is idempotent and org-scoped:");
  // owner2 has no signals yet (created directly). Backfill should seed 2 fields.
  const owner2 = await createOwner(a.id, { displayName: "Backfill Me LLC", entityType: "TRUST" });
  const r1 = await backfillOwnerGenesisSignals(a.id);
  assert((await prisma.intelligenceSignal.count({ where: { entityId: owner2.id } })) === 2, "backfill seeded displayName + entityType for the unsignalled owner");
  const r2 = await backfillOwnerGenesisSignals(a.id);
  assert(r2.backfilled === 0, "second backfill is a no-op (idempotent)");
  assert(r1.backfilled >= 1, "first backfill created at least the new owner's genesis signals");

  console.log("\n[7] Org scoping — org B sees none of org A's ledger:");
  assert((await prisma.observation.count({ where: { organizationId: b.id } })) === 0, "org B has no observations");
  assert((await prisma.intelligenceSignal.count({ where: { organizationId: b.id } })) === 0, "org B has no signals");
  assert((await getFieldProvenance(b.id, ref)).total === 0, "org B provenance read for org A's owner is empty");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
