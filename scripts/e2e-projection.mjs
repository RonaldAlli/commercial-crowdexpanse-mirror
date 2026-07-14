// Focused E2E for the ledger-backed projection engine (v1.2, Commit 1b-2).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the REAL
// lib/owners (ledger-native createOwner + updateOwnerField) and
// lib/intelligence/projection. Centerpiece: the reconstruction invariant —
// rebuildOwner() reproduces the live projection byte-for-byte from the ledger.
// Also proves ledger-native creation, supersession + reprojection, matchKey
// recomputation, sticky overrides + clear/fallback, and org scoping.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner, updateOwnerField } from "../lib/owners.ts";
import { clearOwnerOverride, rebuildOwner } from "../lib/intelligence/projection.ts";
import { appendSignal } from "../lib/intelligence/provenance.ts";

const TAG = "e2e-projection";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const col = async (id) => prisma.owner.findUnique({ where: { id }, select: { displayName: true, entityType: true, matchKey: true } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[1] Ledger-native create — columns are projected + signals exist:");
  const owner = await createOwner(a.id, { displayName: "Riverstone Capital LLC", entityType: "LLC" });
  assert(owner.displayName === "Riverstone Capital LLC" && owner.matchKey === "RIVERSTONE CAPITAL LLC", "columns projected on create + matchKey derived");
  assert((await prisma.intelligenceSignal.count({ where: { entityId: owner.id, state: "ACCEPTED" } })) === 2, "two accepted genesis signals (displayName + entityType)");

  console.log("\n[2] updateOwnerField — supersede + reproject + matchKey recompute:");
  await updateOwnerField(a.id, owner.id, "displayName", "Riverstone Capital Partners LLC");
  let c = await col(owner.id);
  assert(c.displayName === "Riverstone Capital Partners LLC", "displayName reprojected to the new value");
  assert(c.matchKey === "RIVERSTONE CAPITAL PARTNERS LLC", "matchKey recomputed from the new displayName");
  await updateOwnerField(a.id, owner.id, "entityType", "TRUST");
  assert((await col(owner.id)).entityType === "TRUST", "entityType reprojected");

  console.log("\n[3] Override pin is sticky — a fresher non-override does NOT win:");
  await updateOwnerField(a.id, owner.id, "displayName", "Pinned Name LLC", { isOverride: true });
  assert((await col(owner.id)).displayName === "Pinned Name LLC", "override pin projected");
  // Simulate a newer PUBLIC provider signal for the same field.
  await appendSignal(a.id, { entityType: "OWNER", entityId: owner.id, fieldKey: "displayName", valueRaw: "Provider Name LLC", valueNormalized: "PROVIDER NAME LLC", sourceCategory: "PUBLIC", sourceId: "county", asOf: new Date("2027-01-01"), method: "import" });
  const { recomputeOwnerField } = await import("../lib/intelligence/projection.ts");
  await recomputeOwnerField(a.id, owner.id, "displayName");
  assert((await col(owner.id)).displayName === "Pinned Name LLC", "pin still wins over the newer PUBLIC signal (sticky)");

  console.log("\n[4] clearOwnerOverride — falls back to the next-best signal:");
  await clearOwnerOverride(a.id, owner.id, "displayName");
  assert((await col(owner.id)).displayName === "Provider Name LLC", "after clearing the pin, projection falls back to the PUBLIC signal");
  await throws(() => clearOwnerOverride(a.id, owner.id, "displayName"), "clearing when no active override throws");

  console.log("\n[5] Reconstruction invariant — rebuildOwner reproduces the live projection byte-for-byte:");
  const live = await col(owner.id);
  // Corrupt the columns directly, then rebuild purely from the ledger.
  await prisma.owner.update({ where: { id: owner.id }, data: { displayName: "CORRUPTED", entityType: "OTHER", matchKey: "CORRUPTED" } });
  await rebuildOwner(a.id, owner.id);
  const rebuilt = await col(owner.id);
  assert(JSON.stringify(rebuilt) === JSON.stringify(live), "rebuilt projection is identical to the pre-corruption live projection");

  console.log("\n[6] Org scoping:");
  await throws(() => updateOwnerField(b.id, owner.id, "displayName", "X"), "cross-org updateOwnerField rejected");
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
