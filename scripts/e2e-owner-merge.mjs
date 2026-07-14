// Focused E2E for reversible Owner merge/unmerge (v1.2, Commit 1a-2).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// lib/owners merge/unmerge + lib/permissions. Centerpiece: the reversibility
// golden invariant — snapshot the owner graph, merge, unmerge, assert the graph
// is identical. Also proves structural-only merge, immutable external ids stay on
// the loser, chain resolution, guards, and org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { canMergeOwners } from "../lib/permissions.ts";
import {
  addOwnerExternalIdentifier,
  createOwner,
  findCandidatesForInput,
  mergeOwners,
  resolveCanonicalOwner,
  unmergeOwners,
} from "../lib/owners.ts";
import { UserRole } from "@prisma/client";

const TAG = "e2e-owner-merge";
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

const mkSeller = (orgId, name) => prisma.seller.create({ data: { organizationId: orgId, name } });
const mkProperty = (orgId) => prisma.property.create({ data: { organizationId: orgId, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "Nowhere", state: "ZZ" } });

// Snapshot the SEMANTIC identity graph for an org (excludes audit timestamps and
// merge records, which legitimately persist). Content-keyed + sorted so it is a
// stable, comparable fingerprint.
async function snapshotGraph(orgId) {
  const owners = await prisma.owner.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, status: true, mergedIntoId: true, displayName: true, entityType: true, matchKey: true } });
  const aliases = await prisma.ownerAlias.findMany({ where: { owner: { organizationId: orgId } }, select: { ownerId: true, value: true, normalizedValue: true, sourceCategory: true } });
  const xids = await prisma.ownerExternalIdentifier.findMany({ where: { organizationId: orgId }, select: { ownerId: true, provider: true, externalId: true } });
  const sellers = await prisma.seller.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, ownerId: true } });
  const properties = await prisma.property.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { id: true, ownerId: true } });
  const sortStr = (arr) => arr.map((x) => JSON.stringify(x)).sort();
  return JSON.stringify({ owners, aliases: sortStr(aliases), xids: sortStr(xids), sellers, properties });
}

const orgIds = [];
try {
  console.log("\n[0] Permission — merge/unmerge is ADMIN-only:");
  assert(canMergeOwners(UserRole.ADMIN) === true, "ADMIN may merge");
  assert([UserRole.ACQUISITIONS, UserRole.ANALYST, UserRole.DISPOSITIONS].every((r) => canMergeOwners(r) === false), "non-admins may not merge");

  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  // Winner W and loser L, with a rich graph on L.
  const W = await createOwner(a.id, { displayName: "Peachtree Holdings LLC", entityType: "LLC" });
  const L = await createOwner(a.id, { displayName: "Peachtree Hldgs L.L.C.", entityType: "LLC" });
  await prisma.ownerAlias.create({ data: { ownerId: L.id, value: "Peachtree Group", normalizedValue: "PEACHTREE GROUP", sourceCategory: "USER_ENTERED" } });
  await addOwnerExternalIdentifier(a.id, L.id, { provider: "county-ga", externalId: "PARCEL-L" });
  await addOwnerExternalIdentifier(a.id, W.id, { provider: "county-ga", externalId: "PARCEL-W" });
  const sellerL = await mkSeller(a.id, "Contact L");
  const propL = await mkProperty(a.id);
  await prisma.seller.update({ where: { id: sellerL.id }, data: { ownerId: L.id } });
  await prisma.property.update({ where: { id: propL.id }, data: { ownerId: L.id } });

  console.log("\n[1] Snapshot graph BEFORE merge (the reversibility baseline):");
  const before = await snapshotGraph(a.id);
  assert(before.length > 0, "graph snapshot captured");

  console.log("\n[2] Merge L → W (structural):");
  const rec = await mergeOwners(a.id, { winnerId: W.id, loserId: L.id, reason: "MANUAL_DUPLICATE", note: "dupe", actorUserId: "admin-1" });
  const lAfter = await prisma.owner.findUnique({ where: { id: L.id } });
  assert(lAfter.status === "MERGED" && lAfter.mergedIntoId === W.id, "loser tombstoned → winner");
  assert((await prisma.seller.findUnique({ where: { id: sellerL.id } })).ownerId === W.id, "seller repointed to winner");
  assert((await prisma.property.findUnique({ where: { id: propL.id } })).ownerId === W.id, "property repointed to winner");
  const lXids = await prisma.ownerExternalIdentifier.findMany({ where: { ownerId: L.id } });
  assert(lXids.length === 1 && lXids[0].externalId === "PARCEL-L", "external id STAYS on loser (immutable, not moved)");
  const wAliases = await prisma.ownerAlias.findMany({ where: { ownerId: W.id } });
  assert(wAliases.some((x) => x.normalizedValue === "PEACHTREE HLDGS LLC") && wAliases.some((x) => x.normalizedValue === "PEACHTREE GROUP"), "loser's names became merge-derived aliases on winner");
  assert(wAliases.every((x) => x.sourceCategory === "CALCULATION"), "merge-derived aliases marked CALCULATION");

  console.log("\n[3] Resolution + candidate detection follow the merge:");
  assert((await resolveCanonicalOwner(a.id, L.id)).id === W.id, "resolveCanonicalOwner(loser) → winner");
  const cands = await findCandidatesForInput(a.id, { displayName: "Peachtree Hldgs LLC" });
  assert(cands.length === 1 && cands[0].ownerId === W.id, "candidate by loser's name now finds the ACTIVE winner (loser excluded)");

  console.log("\n[4] Unmerge → graph is byte-for-byte identical (the defining property):");
  await unmergeOwners(a.id, rec.id, { actorUserId: "admin-1" });
  const after = await snapshotGraph(a.id);
  assert(after === before, "owner graph after unmerge is identical to the pre-merge snapshot");
  assert((await prisma.ownerMergeRecord.findUnique({ where: { id: rec.id } })).status === "REVERSED", "merge record marked REVERSED (audit persists)");

  console.log("\n[5] Guards:");
  await throws(() => mergeOwners(a.id, { winnerId: W.id, loserId: W.id, reason: "OTHER" }), "self-merge rejected");
  const rec2 = await mergeOwners(a.id, { winnerId: W.id, loserId: L.id, reason: "DUPLICATE_IMPORT" });
  await throws(() => mergeOwners(a.id, { winnerId: W.id, loserId: L.id, reason: "OTHER" }), "merging an already-MERGED loser rejected");
  await throws(() => unmergeOwners(a.id, rec.id), "unmerge of an already-REVERSED record rejected");
  // LIFO: merge W into a third owner, then the W←L record cannot be unmerged (W no longer ACTIVE).
  const T = await createOwner(a.id, { displayName: "Top Owner LLC" });
  await mergeOwners(a.id, { winnerId: T.id, loserId: W.id, reason: "OTHER" });
  await throws(() => unmergeOwners(a.id, rec2.id), "LIFO: cannot unmerge W←L while W is itself MERGED");

  console.log("\n[6] Org scoping:");
  await throws(() => mergeOwners(b.id, { winnerId: W.id, loserId: L.id, reason: "OTHER" }), "cross-org merge rejected");
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
