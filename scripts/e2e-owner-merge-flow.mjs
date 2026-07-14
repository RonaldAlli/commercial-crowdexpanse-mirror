// E2E for the Owner merge/unmerge WORKFLOW (v1.2, Commit 1d-3b). Runs against the
// *_test DB with throwaway orgs (cascade-cleaned). Exercises the domain the ADMIN
// merge workspace delegates to: the ATOMIC orchestration that pairs the (unchanged)
// merge engines with decision resolution. Centerpieces:
//   • merge CONSUMES a CONFIRMED decision (resolves it) and it leaves the queue;
//   • unmerge RESTORES the graph AND returns the still-CONFIRMED pair to the queue;
//   • winner must be explicitly one of the pair (never auto-applied);
//   • duplicate submits never create a second merge record;
//   • BOTH directions roll back atomically when the resolution step fails.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { canMergeOwners } from "../lib/permissions.ts";
import { createOwner, mergeOwnersTx, unmergeOwnersTx } from "../lib/owners.ts";
import { pairContext, recordDecision, countConfirmed, listDecisions } from "../lib/owner-match.ts";
import { mergeCandidateContext, mergeConfirmedPair, unmergeByRecord, listActiveMergeRecords } from "../lib/owner-merge.ts";
import { UserRole } from "@prisma/client";

const TAG = "e2e-owner-merge-flow";
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

const mkSeller = (orgId, ownerId, name) => prisma.seller.create({ data: { organizationId: orgId, name, ownerId } });
const mkProperty = (orgId, ownerId) => prisma.property.create({ data: { organizationId: orgId, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "Nowhere", state: "ZZ", ownerId } });

// Semantic identity-graph snapshot (excludes audit rows/timestamps + merge/decision
// records, which legitimately persist). Stable, comparable fingerprint.
async function snapshotGraph(orgId) {
  const owners = await prisma.owner.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, status: true, mergedIntoId: true, displayName: true, entityType: true, matchKey: true } });
  const aliases = await prisma.ownerAlias.findMany({ where: { owner: { organizationId: orgId } }, select: { ownerId: true, value: true, normalizedValue: true, sourceCategory: true } });
  const sellers = await prisma.seller.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, ownerId: true } });
  const properties = await prisma.property.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, ownerId: true } });
  const sortStr = (arr) => arr.map((x) => JSON.stringify(x)).sort();
  return JSON.stringify({ owners, aliases: sortStr(aliases), sellers, properties });
}

const activeRecordCount = (orgId) => prisma.ownerMergeRecord.count({ where: { organizationId: orgId, status: "ACTIVE" } });

const orgIds = [];
try {
  console.log("\n[0] Permission — merge/unmerge is ADMIN-only:");
  assert(canMergeOwners(UserRole.ADMIN) === true, "ADMIN may merge");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((r) => canMergeOwners(r) === false), "non-admins may not merge");

  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  // Two duplicate owners (identical name → same matchKey). X has more linked
  // records than Y, so the deterministic suggestion should favour X.
  const X = await createOwner(a.id, { displayName: "Acme Holdings LLC", entityType: "LLC" });
  const Y = await createOwner(a.id, { displayName: "Acme Holdings LLC", entityType: "LLC" });
  await mkSeller(a.id, X.id, "Contact X1");
  await mkSeller(a.id, X.id, "Contact X2");
  await mkProperty(a.id, X.id); // X total = 3
  await mkSeller(a.id, Y.id, "Contact Y1"); // Y total = 1

  console.log("\n[1] A CONFIRMED decision is awaiting merge:");
  const ctx0 = await pairContext(a.id, X.id, Y.id);
  const decision = await recordDecision(a.id, { ...ctx0, status: "CONFIRMED", decidedByUserId: "admin-1" });
  assert((await countConfirmed(a.id)) === 1, "countConfirmed is 1 (pair awaiting merge)");
  assert((await listDecisions(a.id, "CONFIRMED")).total === 1, "awaiting-merge list has the pair");

  console.log("\n[2] Merge context recomputes counts + advisory winner (server-authoritative):");
  const mc = await mergeCandidateContext(a.id, decision.id);
  const xSide = mc.a.id === X.id ? mc.a : mc.b;
  const ySide = mc.a.id === Y.id ? mc.a : mc.b;
  assert(xSide.total === 3 && ySide.total === 1, "link counts computed from live graph (X=3, Y=1)");
  assert(mc.suggestion.winnerId === X.id, "suggestion favours the owner with more linked records (X)");

  console.log("\n[3] Snapshot BEFORE merge (reversibility baseline):");
  const before = await snapshotGraph(a.id);
  assert(before.length > 0, "graph snapshot captured");

  console.log("\n[4] Winner must be explicitly one of the pair — never auto-applied:");
  await throws(() => mergeConfirmedPair(a.id, { decisionId: decision.id, winnerId: "not-in-pair", reason: "MANUAL_DUPLICATE", actorUserId: "admin-1" }), "merge with a winner outside the pair is rejected");
  assert((await activeRecordCount(a.id)) === 0, "no merge record created by the rejected attempt");
  assert((await prisma.owner.findUnique({ where: { id: Y.id } })).status === "ACTIVE", "both owners still ACTIVE after rejected attempt");

  console.log("\n[5] Merge (explicit winner X) resolves the decision and leaves the queue:");
  const { record } = await mergeConfirmedPair(a.id, { decisionId: decision.id, winnerId: X.id, reason: "MANUAL_DUPLICATE", note: "dupe", actorUserId: "admin-1" });
  const yAfter = await prisma.owner.findUnique({ where: { id: Y.id } });
  assert(yAfter.status === "MERGED" && yAfter.mergedIntoId === X.id, "loser Y tombstoned → winner X");
  assert((await prisma.seller.count({ where: { ownerId: X.id } })) === 3, "Y's seller repointed to X (X now has 3)");
  const decAfter = await prisma.ownerMatchDecision.findUnique({ where: { id: decision.id } });
  assert(decAfter.status === "CONFIRMED" && decAfter.resolvedAt !== null && decAfter.mergeRecordId === record.id, "decision stays CONFIRMED but is resolved → this merge record");
  assert((await countConfirmed(a.id)) === 0, "resolved pair left the awaiting-merge queue");
  assert((await listActiveMergeRecords(a.id)).total === 1, "merge history shows one active record");

  console.log("\n[6] Duplicate submit does NOT create a second merge record:");
  await throws(() => mergeConfirmedPair(a.id, { decisionId: decision.id, winnerId: X.id, reason: "MANUAL_DUPLICATE", actorUserId: "admin-1" }), "re-merging an already-resolved decision is rejected");
  assert((await prisma.ownerMergeRecord.count({ where: { organizationId: a.id } })) === 1, "still exactly one merge record (no duplicate)");

  console.log("\n[7] Unmerge restores the graph AND returns the pair to the queue:");
  await unmergeByRecord(a.id, record.id, { actorUserId: "admin-1" });
  assert((await snapshotGraph(a.id)) === before, "owner graph after unmerge is byte-for-byte identical to the baseline");
  const decUnmerged = await prisma.ownerMatchDecision.findUnique({ where: { id: decision.id } });
  assert(decUnmerged.status === "CONFIRMED" && decUnmerged.resolvedAt === null && decUnmerged.mergeRecordId === null, "decision stays CONFIRMED; resolution metadata cleared");
  assert((await countConfirmed(a.id)) === 1, "pair is back in the awaiting-merge queue");
  assert((await prisma.ownerMergeRecord.findUnique({ where: { id: record.id } })).status === "REVERSED", "merge record marked REVERSED (audit persists)");

  console.log("\n[8] ATOMIC rollback — MERGE direction (force the resolution step to fail):");
  await throws(() => prisma.$transaction(async (tx) => {
    await mergeOwnersTx(tx, a.id, { winnerId: X.id, loserId: Y.id, reason: "MANUAL_DUPLICATE" });
    throw new Error("forced decision-resolution failure"); // simulates the resolve write failing
  }), "a merge tx whose resolution step throws is rejected");
  assert((await activeRecordCount(a.id)) === 0, "no merge persisted — the whole tx rolled back");
  assert((await prisma.owner.findUnique({ where: { id: Y.id } })).status === "ACTIVE", "loser still ACTIVE after rollback");
  assert((await countConfirmed(a.id)) === 1, "decision still unresolved (in queue) after rollback");

  console.log("\n[9] ATOMIC rollback — UNMERGE direction (force the unresolution step to fail):");
  const { record: record2 } = await mergeConfirmedPair(a.id, { decisionId: decision.id, winnerId: X.id, reason: "MANUAL_DUPLICATE", actorUserId: "admin-1" });
  assert((await activeRecordCount(a.id)) === 1, "a fresh merge is active before the rollback test");
  await throws(() => prisma.$transaction(async (tx) => {
    await unmergeOwnersTx(tx, a.id, record2.id);
    throw new Error("forced decision-unresolution failure"); // simulates the unresolve write failing
  }), "an unmerge tx whose unresolution step throws is rejected");
  assert((await prisma.ownerMergeRecord.findUnique({ where: { id: record2.id } })).status === "ACTIVE", "merge record still ACTIVE — the whole tx rolled back");
  assert((await prisma.owner.findUnique({ where: { id: Y.id } })).status === "MERGED", "loser still MERGED after rollback");
  const decStill = await prisma.ownerMatchDecision.findUnique({ where: { id: decision.id } });
  assert(decStill.resolvedAt !== null && decStill.mergeRecordId === record2.id, "decision still resolved after rollback");

  console.log("\n[10] Org scoping:");
  await throws(() => mergeConfirmedPair(b.id, { decisionId: decision.id, winnerId: X.id, reason: "OTHER", actorUserId: "x" }), "cross-org merge of A's decision rejected");
  await throws(() => unmergeByRecord(b.id, record2.id), "cross-org unmerge of A's record rejected");
  assert((await prisma.ownerMergeRecord.count({ where: { organizationId: b.id } })) === 0, "org B has no merge records");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
