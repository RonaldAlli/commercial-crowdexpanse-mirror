// E2E for the Owner UI domain path + permission enforcement (v1.2, Commit 1d-1).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Server actions
// call requireUser() (request-scoped, not headless), so this exercises (A) the
// exact lib calls the actions delegate to — the domain contract the pages depend
// on, incl. the create-time duplicate signal and the pin/clear override flow —
// and (B) the NEW OWNER authorization call-sites via checkAuthorized (the policy
// the actions enforce), asserting denials are audited. It also proves the UI's
// core invariant structurally: every edit produces ledger signals (never a direct
// column write).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner, updateOwnerField, findCandidatesForInput, getOwner } from "../lib/owners.ts";
import { clearOwnerOverride } from "../lib/intelligence/projection.ts";
import { getFieldProvenance, appendSignal } from "../lib/intelligence/provenance.ts";
import { checkAuthorized } from "../lib/authorize.ts";

const TAG = "e2e-owner-ui";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
const nameRef = (id) => ({ entityType: "OWNER", entityId: id, fieldKey: "displayName" });
const acceptedSignals = (org, id) => prisma.intelligenceSignal.count({ where: { organizationId: org, entityId: id, state: "ACCEPTED" } });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Actor", email: `${TAG}-${process.pid}@example.com`, hashedPassword: "x", role: "ANALYST" } });
  const principal = (role) => ({ id: actor.id, role, organizationId: a.id });

  console.log("\n[A1] Create flows through the ledger (columns are projected + signals exist):");
  const owner = await createOwner(a.id, { displayName: "Skyline Partners LLC", entityType: "LLC", actorUserId: actor.id });
  assert(owner.displayName === "Skyline Partners LLC" && owner.matchKey === "SKYLINE PARTNERS LLC", "owner created with projected columns");
  assert((await acceptedSignals(a.id, owner.id)) === 2, "two accepted genesis signals (displayName + entityType)");

  console.log("\n[A2] Create-time duplicate detection (the data behind the warning — proposal only):");
  const candidates = await findCandidatesForInput(a.id, { displayName: "Skyline Partners LLC" });
  assert(candidates.length === 1 && candidates[0].ownerId === owner.id && candidates[0].reason === "exact-match-key", "a same-name owner is surfaced as an exact-match candidate");
  assert(candidates[0].identityConfidence === 0.9, "candidate carries Identity Confidence (0.9), never an auto-link");

  console.log("\n[A3] Edit a changed field → ledger supersedes + reprojects (no direct column write):");
  const before = await acceptedSignals(a.id, owner.id);
  await updateOwnerField(a.id, owner.id, "displayName", "Skyline Partners Group LLC", { actorUserId: actor.id });
  const edited = await getOwner(a.id, owner.id);
  assert(edited.displayName === "Skyline Partners Group LLC" && edited.matchKey === "SKYLINE PARTNERS GROUP LLC", "displayName reprojected + matchKey recomputed");
  assert((await acceptedSignals(a.id, owner.id)) === before, "still 2 accepted (prior displayName signal superseded, not duplicated)");

  console.log("\n[A4] Pin (override) then clear — the edit/detail override controls:");
  // A lower-precedence provider signal exists (as a later refresh would create),
  // so clearing the pin has something to fall back to — the meaningful case.
  await appendSignal(a.id, { entityType: "OWNER", entityId: owner.id, fieldKey: "displayName", valueRaw: "Registry Skyline LLC", valueNormalized: "REGISTRY SKYLINE LLC", sourceCategory: "PUBLIC", sourceId: "county", asOf: new Date("2026-01-01"), method: "import" });
  await updateOwnerField(a.id, owner.id, "displayName", "Pinned Skyline LLC", { isOverride: true, actorUserId: actor.id });
  let prov = await getFieldProvenance(a.id, nameRef(owner.id));
  assert(prov.accepted.some((s) => s.isOverride), "an active override pin is present after pinning");
  assert((await getOwner(a.id, owner.id)).displayName === "Pinned Skyline LLC", "pinned USER_ENTERED value wins over the PUBLIC signal");
  await clearOwnerOverride(a.id, owner.id, "displayName");
  prov = await getFieldProvenance(a.id, nameRef(owner.id));
  assert(!prov.accepted.some((s) => s.isOverride), "no active override after clearing the pin");
  assert((await getOwner(a.id, owner.id)).displayName === "Registry Skyline LLC", "projection falls back to the next-best (PUBLIC) signal");

  console.log("\n[B1] OWNER write is enforced — ADMIN/ACQUISITIONS allowed, ANALYST/DISPOSITIONS denied:");
  assert((await checkAuthorized(principal("ADMIN"), "CREATE", "OWNER")) === true, "ADMIN may create owners");
  assert((await checkAuthorized(principal("ACQUISITIONS"), "UPDATE", "OWNER")) === true, "ACQUISITIONS may update owners");
  assert((await checkAuthorized(principal("ANALYST"), "CREATE", "OWNER")) === false, "ANALYST may NOT create owners");
  assert((await checkAuthorized(principal("DISPOSITIONS"), "UPDATE", "OWNER")) === false, "DISPOSITIONS may NOT update owners");

  console.log("\n[B2] OWNER read is open to every role; denials are audited:");
  for (const role of ["ADMIN", "ACQUISITIONS", "ANALYST", "DISPOSITIONS"]) {
    assert((await checkAuthorized(principal(role), "READ", "OWNER")) === true, `${role} may read owners`);
  }
  const denials = await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "authorization.denied" } });
  assert(denials >= 2, "denied OWNER writes were recorded as authorization.denied activity");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
