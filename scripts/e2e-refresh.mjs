// Focused E2E for the manual source adapter + refresh orchestration (v1.2, 1c).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// runRefresh orchestrator, the manualAdapter, and the ledger/projection stack.
// Centerpieces: the idempotency golden (running the same refresh twice leaves the
// ledger byte-for-byte identical) and value-grain NOOP. Also proves ledger writes
// go through Observation→Signal→Projection with adapterVersion stamped, precedence
// after refresh, atomic rejection (FAILED job, ledger clean), and org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner } from "../lib/owners.ts";
import { appendSignal } from "../lib/intelligence/provenance.ts";
import { manualAdapter, MANUAL_ADAPTER_VERSION } from "../lib/intelligence/sources/manual-adapter.ts";
import { runRefresh, RefreshRejectedError } from "../lib/intelligence/refresh.ts";

const TAG = "e2e-refresh";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }

const col = async (id) => prisma.owner.findUnique({ where: { id }, select: { displayName: true, entityType: true, matchKey: true } });
// Byte-for-byte ledger snapshot for an entity (excludes volatile timestamps).
const snapshot = async (orgId, ownerId) => {
  const obs = await prisma.observation.findMany({ where: { organizationId: orgId, entityId: ownerId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, fieldKey: true, valueRaw: true, valueNormalized: true, sourceCategory: true, sourceId: true, adapterVersion: true, method: true } });
  const sig = await prisma.intelligenceSignal.findMany({ where: { organizationId: orgId, entityId: ownerId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, fieldKey: true, valueRaw: true, valueNormalized: true, state: true, sourceCategory: true, isOverride: true, adapterVersion: true, observationId: true, supersededById: true } });
  return JSON.stringify({ obs, sig });
};
const ASOF = new Date("2026-06-01T00:00:00.000Z");
const refreshInput = (ownerId, records, extra = {}) => ({ targetEntityType: "OWNER", targetEntityId: ownerId, asOf: ASOF, records, ...extra });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Happy path — manual refresh flows through Observation→Signal→Projection:");
  const owner = await createOwner(a.id, { displayName: "Origin Holdings LLC", entityType: "LLC" });
  const job1 = await runRefresh(a.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "Refreshed Holdings LLC" }]));
  assert(job1.status === "SUCCEEDED", "job SUCCEEDED");
  assert(job1.observationsRecorded === 1 && job1.signalsAccepted === 1 && job1.signalsSuperseded === 1, "counts: 1 recorded, 1 accepted, 1 superseded");
  assert(JSON.stringify(job1.affectedEntityIds) === JSON.stringify([owner.id]), "affectedEntityIds = [owner]");
  const c1 = await col(owner.id);
  assert(c1.displayName === "Refreshed Holdings LLC" && c1.matchKey === "REFRESHED HOLDINGS LLC", "projection updated + matchKey recomputed");
  const newSig = await prisma.intelligenceSignal.findFirst({ where: { organizationId: a.id, entityId: owner.id, fieldKey: "displayName", state: "ACCEPTED" } });
  assert(newSig.sourceId === "manual" && newSig.adapterVersion === MANUAL_ADAPTER_VERSION, "signal stamped sourceId=manual + adapterVersion");

  console.log("\n[2] Idempotency golden — the SAME refresh twice leaves the ledger byte-for-byte identical:");
  const before = await snapshot(a.id, owner.id);
  const job1again = await runRefresh(a.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "Refreshed Holdings LLC" }]));
  assert(job1again.id === job1.id, "same requestKey (content hash) returns the SAME job — never re-applied");
  assert((await snapshot(a.id, owner.id)) === before, "ledger is byte-for-byte identical after the replay");

  console.log("\n[3] Value-grain NOOP — a new run with an unchanged value records nothing:");
  const beforeNoop = await snapshot(a.id, owner.id);
  const noop = await runRefresh(a.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "Refreshed Holdings LLC" }], { requestKey: "force-distinct-1" }));
  assert(noop.status === "NOOP" && noop.signalsAccepted === 0 && noop.observationsRecorded === 0, "distinct requestKey but equal value → NOOP, nothing recorded");
  assert(JSON.stringify(noop.affectedEntityIds) === JSON.stringify([]), "NOOP touches no entities");
  assert((await snapshot(a.id, owner.id)) === beforeNoop, "ledger unchanged after a NOOP");

  console.log("\n[4] Precedence after refresh — a USER_ENTERED refresh wins over an equal-dated PUBLIC signal:");
  await appendSignal(a.id, { entityType: "OWNER", entityId: owner.id, fieldKey: "displayName", valueRaw: "County Records LLC", valueNormalized: "COUNTY RECORDS LLC", sourceCategory: "PUBLIC", sourceId: "county", asOf: ASOF, method: "import" });
  const job4 = await runRefresh(a.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "User Corrected LLC" }], { requestKey: "correct-1" }));
  assert(job4.status === "SUCCEEDED" && job4.signalsSuperseded === 1, "refresh supersedes the prior USER_ENTERED signal");
  assert((await col(owner.id)).displayName === "User Corrected LLC", "USER_ENTERED refresh wins over the same-asOf PUBLIC signal (category tiebreak)");

  console.log("\n[5] Atomic rejection — one invalid record fails the whole run; the ledger is untouched:");
  const beforeFail = await snapshot(a.id, owner.id);
  const failed = await runRefresh(a.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "Should Not Land LLC" }, { fieldKey: "bogusField", value: "x" }], { requestKey: "bad-batch-1" }));
  assert(failed.status === "FAILED", "invalid batch → job FAILED (durable audit row)");
  assert(/rejected/.test(failed.error ?? ""), "FAILED job records the rejection reason");
  assert((await snapshot(a.id, owner.id)) === beforeFail, "ledger untouched — the valid record in the batch did NOT partially land");
  assert((await col(owner.id)).displayName === "User Corrected LLC", "projection unchanged by the failed run");

  console.log("\n[6] Refresh is observational + org-scoped — never creates Owners, never crosses orgs:");
  const ownersInABefore = await prisma.owner.count({ where: { organizationId: a.id } });
  await throws(() => runRefresh(a.id, manualAdapter, refreshInput("does-not-exist", [{ fieldKey: "displayName", value: "Ghost LLC" }])), "unknown target rejected (never creates an Owner)");
  assert((await prisma.owner.count({ where: { organizationId: a.id } })) === ownersInABefore, "no Owner row was created by the rejected refresh");
  await throws(() => runRefresh(b.id, manualAdapter, refreshInput(owner.id, [{ fieldKey: "displayName", value: "Cross Org LLC" }])), "cross-org refresh rejected (target not in org B)");
  assert((await prisma.intelligenceSignal.count({ where: { organizationId: b.id } })) === 0, "org B has no signals");
  assert((await prisma.refreshJob.count({ where: { organizationId: b.id } })) === 0, "org B has no refresh jobs");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
