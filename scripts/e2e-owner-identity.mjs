// Focused E2E for the Owner identity foundation (v1.2, Commit 1a).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// lib/owners data-access + lib/intelligence/owner-identity. Proves: owner create
// + match-key storage, seller/property linking, candidate detection (proposals
// only), org scoping (no cross-org read/link), ExternalIdentifier immutability +
// uniqueness. Merge/unmerge is Commit 1a-2 and NOT exercised here.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import {
  addOwnerExternalIdentifier,
  createOwner,
  findCandidatesForInput,
  getOwner,
  linkPropertyToOwner,
  linkSellerToOwner,
  listOwners,
} from "../lib/owners.ts";

const TAG = "e2e-owner-identity";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) {
  try { await fn(); assert(false, msg); }
  catch { assert(true, msg); }
}

const mkSeller = (orgId, name) => prisma.seller.create({ data: { organizationId: orgId, name } });
const mkProperty = (orgId) =>
  prisma.property.create({ data: { organizationId: orgId, name: "Asset", assetType: "MULTIFAMILY", addressLine1: "1 Way", city: "Nowhere", state: "ZZ" } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Create owner + match-key computed:");
  const owner = await createOwner(a.id, { displayName: "Smith Holdings, L.L.C.", entityType: "LLC" });
  assert(owner.matchKey === "SMITH HOLDINGS LLC", "match key normalized on create");
  assert(owner.status === "ACTIVE" && owner.entityType === "LLC", "owner defaults: ACTIVE + entityType stored");

  console.log("\n[2] Link seller and property to owner (same org):");
  const sellerA = await mkSeller(a.id, "Jane Smith");
  const propA = await mkProperty(a.id);
  await linkSellerToOwner(a.id, sellerA.id, owner.id);
  await linkPropertyToOwner(a.id, propA.id, owner.id);
  const sAfter = await prisma.seller.findUnique({ where: { id: sellerA.id }, select: { ownerId: true } });
  const pAfter = await prisma.property.findUnique({ where: { id: propA.id }, select: { ownerId: true } });
  assert(sAfter.ownerId === owner.id, "seller linked to owner");
  assert(pAfter.ownerId === owner.id, "property linked to owner");

  console.log("\n[3] Candidate detection — proposals only, within org:");
  const cands = await findCandidatesForInput(a.id, { displayName: "SMITH HOLDINGS LLC" });
  assert(cands.length === 1 && cands[0].ownerId === owner.id && cands[0].reason === "exact-match-key", "exact-name input proposes the existing owner");
  const none = await findCandidatesForInput(a.id, { displayName: "Totally Different Co" });
  assert(none.length === 0, "unrelated input proposes nothing");

  console.log("\n[4] ExternalIdentifier — immutable insert + uniqueness:");
  const xid = await addOwnerExternalIdentifier(a.id, owner.id, { provider: "county-ga", externalId: "PARCEL-123" });
  assert(xid.provider === "county-ga" && xid.externalId === "PARCEL-123", "external identifier recorded");
  await throws(
    () => addOwnerExternalIdentifier(a.id, owner.id, { provider: "county-ga", externalId: "PARCEL-123" }),
    "duplicate (org, provider, externalId) rejected by unique constraint",
  );

  console.log("\n[5] Org scoping — org B cannot see or touch org A's owner:");
  assert((await listOwners(b.id)).length === 0, "org B lists zero owners");
  assert((await getOwner(b.id, owner.id)) === null, "org B cannot fetch org A's owner");
  assert((await findCandidatesForInput(b.id, { displayName: "Smith Holdings LLC" })).length === 0, "org B gets no candidates for org A's owner");
  const sellerB = await mkSeller(b.id, "Bob Jones");
  await throws(() => linkSellerToOwner(b.id, sellerB.id, owner.id), "cross-org link (org B seller → org A owner) rejected");
  await throws(() => linkSellerToOwner(a.id, sellerB.id, owner.id), "cross-org link (org B seller via org A) rejected");

  console.log("\n[6] Same-normalized-name owners both surface as candidates (never auto-linked):");
  const twin = await createOwner(a.id, { displayName: "smith holdings llc" });
  const twinCands = await findCandidatesForInput(a.id, { displayName: "Smith Holdings LLC" });
  assert(twinCands.length === 2, "both same-key owners proposed as candidates");
  assert(twin.id !== owner.id, "the twin is a distinct owner (no dedup on normalized name)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
