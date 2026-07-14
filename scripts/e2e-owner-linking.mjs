// E2E for Seller/Property ↔ Owner linking (v1.2, Commit 1d-2a). Runs against the
// *_test DB with throwaway orgs (cascade-cleaned). Server actions call
// requireUser() (not headless), so this exercises the lib functions the actions
// delegate to (link/unlink/move) plus the OWNER authorization the actions enforce.
// Core invariant proven structurally: linking changes ONLY the operational FK —
// no Observation, no Signal, identity untouched (Volume 12: "linking never
// changes identity"). Moves are atomic (single ownerId update, never null).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner, linkSellerToOwner, linkPropertyToOwner, unlinkSellerFromOwner, unlinkPropertyFromOwner } from "../lib/owners.ts";
import { checkAuthorized } from "../lib/authorize.ts";

const TAG = "e2e-owner-linking";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const ledgerCount = async (org) => (await prisma.observation.count({ where: { organizationId: org } })) + (await prisma.intelligenceSignal.count({ where: { organizationId: org } }));
const sellerSansOwner = async (id) => { const s = await prisma.seller.findUnique({ where: { id }, select: { name: true, company: true, email: true, phone: true, city: true, state: true, motivation: true } }); return JSON.stringify(s); };

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Actor", email: `${TAG}-${process.pid}@example.com`, hashedPassword: "x", role: "ANALYST" } });
  const principal = (role) => ({ id: actor.id, role, organizationId: a.id });

  const owner1 = await createOwner(a.id, { displayName: "Anchor Holdings LLC", entityType: "LLC" });
  const owner2 = await createOwner(a.id, { displayName: "Second Owner LLC", entityType: "LLC" });
  const ownerB = await createOwner(b.id, { displayName: "Foreign Owner LLC", entityType: "LLC" });
  const seller = await prisma.seller.create({ data: { organizationId: a.id, name: "Marcus Henley", company: "Henley Urban" } });
  const property = await prisma.property.create({ data: { organizationId: a.id, name: "Elmwood 24", assetType: "MULTIFAMILY", addressLine1: "24 Elmwood Ave", city: "Atlanta", state: "GA" } });

  const baselineLedger = await ledgerCount(a.id); // signals from createOwner; linking must not change this
  const sellerSnapshot = await sellerSansOwner(seller.id);

  console.log("\n[1] Link seller + property to an owner:");
  await linkSellerToOwner(a.id, seller.id, owner1.id);
  await linkPropertyToOwner(a.id, property.id, owner1.id);
  assert((await prisma.seller.findUnique({ where: { id: seller.id } })).ownerId === owner1.id, "seller linked to owner1");
  assert((await prisma.property.findUnique({ where: { id: property.id } })).ownerId === owner1.id, "property linked to owner1");

  console.log("\n[2] Move each to a second owner (atomic re-link A→B, never null):");
  await linkSellerToOwner(a.id, seller.id, owner2.id);
  await linkPropertyToOwner(a.id, property.id, owner2.id);
  assert((await prisma.seller.findUnique({ where: { id: seller.id } })).ownerId === owner2.id, "seller moved to owner2");
  assert((await prisma.property.findUnique({ where: { id: property.id } })).ownerId === owner2.id, "property moved to owner2");

  console.log("\n[3] Linking is identity-inert — only the FK changes, no ledger writes:");
  assert((await ledgerCount(a.id)) === baselineLedger, "no Observation or IntelligenceSignal created by linking/moving");
  assert((await sellerSansOwner(seller.id)) === sellerSnapshot, "only ownerId changed on the seller (all other fields identical)");

  console.log("\n[4] Unlink + idempotent repeat:");
  await unlinkSellerFromOwner(a.id, seller.id);
  await unlinkPropertyFromOwner(a.id, property.id);
  assert((await prisma.seller.findUnique({ where: { id: seller.id } })).ownerId === null, "seller unlinked (ownerId null)");
  assert((await prisma.property.findUnique({ where: { id: property.id } })).ownerId === null, "property unlinked (ownerId null)");
  await unlinkSellerFromOwner(a.id, seller.id); // repeat
  assert((await prisma.seller.findUnique({ where: { id: seller.id } })).ownerId === null, "repeated unlink is idempotent (no throw, still null)");

  console.log("\n[5] Cross-org linking is rejected:");
  await throws(() => linkSellerToOwner(b.id, seller.id, ownerB.id), "linking an org-A seller under org B is rejected");
  await throws(() => linkSellerToOwner(a.id, seller.id, ownerB.id), "linking to an org-B owner from org A is rejected");
  assert((await prisma.seller.findUnique({ where: { id: seller.id } })).ownerId === null, "seller remained unlinked after rejected cross-org attempts");

  console.log("\n[6] OWNER-write enforcement (linking is an OWNER write) + audited denials:");
  assert((await checkAuthorized(principal("ADMIN"), "UPDATE", "OWNER")) === true, "ADMIN may link");
  assert((await checkAuthorized(principal("ACQUISITIONS"), "UPDATE", "OWNER")) === true, "ACQUISITIONS may link");
  assert((await checkAuthorized(principal("ANALYST"), "UPDATE", "OWNER")) === false, "ANALYST may NOT link");
  assert((await checkAuthorized(principal("DISPOSITIONS"), "UPDATE", "OWNER")) === false, "DISPOSITIONS may NOT link");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "authorization.denied" } })) >= 2, "denied link attempts were audited");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
