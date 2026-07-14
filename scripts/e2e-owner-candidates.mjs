// E2E for standalone candidate review (v1.2, Commit 1d-2b). Runs against the
// *_test DB with throwaway orgs (cascade-cleaned). Server actions call
// requireUser() (not headless), so this exercises the domain lib the actions
// delegate to (queue assembly, decision persistence, suppression, material-change
// re-surfacing, ADMIN reopen) plus the authorization the actions enforce. Core
// guarantee proven structurally: Candidate Review records decisions ONLY — never
// merges, never creates/deletes owners, never writes ledger rows.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner } from "../lib/owners.ts";
import { generateCandidateQueue, pairContext, recordDecision, reopenDecision, listDecisions, countConfirmed } from "../lib/owner-match.ts";
import { checkAuthorized } from "../lib/authorize.ts";
import { can, canReopenMatchDecision } from "../lib/permissions.ts";

const TAG = "e2e-owner-candidates";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
async function throws(fn, msg) { try { await fn(); assert(false, msg); } catch { assert(true, msg); } }
const pendingTotal = async (org) => (await generateCandidateQueue(org)).total;

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Actor", email: `${TAG}-${process.pid}@example.com`, hashedPassword: "x", role: "ADMIN" } });
  const principal = (role) => ({ id: actor.id, role, organizationId: a.id });

  const owner1 = await createOwner(a.id, { displayName: "Beacon Capital LLC", entityType: "LLC" });
  const owner2 = await createOwner(a.id, { displayName: "Beacon Capital LLC", entityType: "LLC" }); // same matchKey → duplicate

  console.log("\n[1] The duplicate pair appears in the pending queue:");
  const q = await generateCandidateQueue(a.id);
  assert(q.total === 1, "one pending duplicate pair");
  assert(q.pending[0].reason === "exact-match-key", "reason is exact-match-key (same normalized name)");

  console.log("\n[2] Dismiss suppresses the pair (deterministic pair identity):");
  const c1 = await pairContext(a.id, owner1.id, owner2.id);
  const c2 = await pairContext(a.id, owner2.id, owner1.id);
  assert(c1.ownerIdA === c2.ownerIdA && c1.ownerIdB === c2.ownerIdB, "pairContext canonicalizes order-independently");
  await recordDecision(a.id, { ...c1, status: "DISMISSED", decidedByUserId: actor.id });
  assert((await pendingTotal(a.id)) === 0, "dismissed pair is suppressed from the queue");

  console.log("\n[3] A material identity change re-surfaces the dismissed pair:");
  await prisma.ownerAlias.create({ data: { ownerId: owner1.id, value: "Beacon Cap", normalizedValue: "BEACON CAP", sourceCategory: "USER_ENTERED" } });
  assert((await pendingTotal(a.id)) === 1, "adding an alias (material change) re-surfaces the pair");

  console.log("\n[4] Re-dismiss with the new fingerprint suppresses again:");
  await recordDecision(a.id, { ...(await pairContext(a.id, owner1.id, owner2.id)), status: "DISMISSED", decidedByUserId: actor.id });
  assert((await pendingTotal(a.id)) === 0, "re-dismissed with the updated fingerprint");

  console.log("\n[5] Explicit ADMIN reopen returns the pair to pending:");
  await reopenDecision(a.id, owner1.id, owner2.id, actor.id);
  assert((await pendingTotal(a.id)) === 1, "reopened pair is pending again");

  console.log("\n[6] Confirm records a decision only — it NEVER merges:");
  await recordDecision(a.id, { ...(await pairContext(a.id, owner1.id, owner2.id)), status: "CONFIRMED", decidedByUserId: actor.id });
  assert((await pendingTotal(a.id)) === 0, "confirmed pair leaves the pending queue");
  assert((await countConfirmed(a.id)) === 1, "one confirmed pair awaits merge");
  assert((await listDecisions(a.id, "CONFIRMED")).total === 1, "confirmed pair is listed for the merge step");
  const owners = await prisma.owner.findMany({ where: { organizationId: a.id }, select: { status: true } });
  assert(owners.length === 2 && owners.every((o) => o.status === "ACTIVE"), "both owners remain ACTIVE and distinct (no merge occurred)");
  assert((await prisma.ownerMergeRecord.count({ where: { organizationId: a.id } })) === 0, "no OwnerMergeRecord was created by confirming");

  console.log("\n[7] Permission enforcement + audited denials:");
  assert((await checkAuthorized(principal("ADMIN"), "MANAGE", "OWNER_IDENTITY")) === true, "ADMIN may decide");
  assert((await checkAuthorized(principal("ACQUISITIONS"), "MANAGE", "OWNER_IDENTITY")) === true, "ACQUISITIONS may decide");
  assert((await checkAuthorized(principal("ANALYST"), "MANAGE", "OWNER_IDENTITY")) === false, "ANALYST may NOT decide");
  assert((await checkAuthorized(principal("DISPOSITIONS"), "MANAGE", "OWNER_IDENTITY")) === false, "DISPOSITIONS may NOT decide");
  assert(can("ANALYST", "READ", "OWNER_IDENTITY") === false && can("DISPOSITIONS", "READ", "OWNER_IDENTITY") === false, "ANALYST/DISPOSITIONS cannot even view the queue");
  assert(canReopenMatchDecision("ADMIN") === true && canReopenMatchDecision("ACQUISITIONS") === false, "reopen is ADMIN-only");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "authorization.denied" } })) >= 2, "denied decisions were audited");

  console.log("\n[8] Org scoping:");
  await throws(() => pairContext(b.id, owner1.id, owner2.id), "pairContext rejects owners outside the org");
  assert((await prisma.ownerMatchDecision.count({ where: { organizationId: b.id } })) === 0, "org B has no decisions");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
