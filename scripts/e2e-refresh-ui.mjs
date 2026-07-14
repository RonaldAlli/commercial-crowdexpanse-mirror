// E2E for the Owner manual-refresh UI surface (v1.2, Commit 1d-3a). Runs against
// the *_test DB with throwaway orgs (cascade-cleaned). Server actions call
// requireUser() (not headless), so this exercises the domain the action delegates
// to (runRefresh via the manual adapter) plus the NEW bits: the entity-scoped job
// history helper and REFRESH permission enforcement. The refresh mechanics
// (Observation→Signal→Projection, idempotency) are covered by e2e-refresh.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { createOwner } from "../lib/owners.ts";
import { runRefresh } from "../lib/intelligence/refresh.ts";
import { manualAdapter } from "../lib/intelligence/sources/manual-adapter.ts";
import { listRefreshJobsForEntity } from "../lib/refresh-jobs.ts";
import { checkAuthorized } from "../lib/authorize.ts";
import { can } from "../lib/permissions.ts";

const TAG = "e2e-refresh-ui";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}
const ASOF = new Date("2026-06-01T00:00:00.000Z");

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);
  const actor = await prisma.user.create({ data: { organizationId: a.id, name: "Actor", email: `${TAG}-${process.pid}@example.com`, hashedPassword: "x", role: "ACQUISITIONS" } });
  const principal = (role) => ({ id: actor.id, role, organizationId: a.id });

  const owner1 = await createOwner(a.id, { displayName: "Refresh Target LLC", entityType: "LLC" });
  const owner2 = await createOwner(a.id, { displayName: "Other Owner LLC", entityType: "LLC" });

  console.log("\n[1] Trigger path records a job for the owner (via the manual adapter):");
  const job = await runRefresh(a.id, manualAdapter, { targetEntityType: "OWNER", targetEntityId: owner1.id, asOf: ASOF, records: [{ fieldKey: "displayName", value: "Refreshed Name LLC" }] }, { actorUserId: actor.id });
  assert(job.status === "SUCCEEDED" && job.signalsAccepted === 1, "refresh job SUCCEEDED with one accepted signal");
  assert((await prisma.owner.findUnique({ where: { id: owner1.id } })).displayName === "Refreshed Name LLC", "projection updated via the refresh");

  console.log("\n[2] Entity-scoped history returns only this owner's jobs:");
  const forOwner1 = await listRefreshJobsForEntity(a.id, "OWNER", owner1.id);
  const forOwner2 = await listRefreshJobsForEntity(a.id, "OWNER", owner2.id);
  assert(forOwner1.length === 1 && forOwner1[0].id === job.id, "owner1 history has exactly its job");
  assert(forOwner2.length === 0, "owner2 (never refreshed) has an empty history");
  assert(typeof forOwner1[0].sourceKey === "string" && "signalsAccepted" in forOwner1[0], "history rows carry source + counts");

  console.log("\n[3] REFRESH enforcement — write ADMIN/ACQUISITIONS, read all; denials audited:");
  assert((await checkAuthorized(principal("ADMIN"), "MANAGE", "REFRESH")) === true, "ADMIN may run a refresh");
  assert((await checkAuthorized(principal("ACQUISITIONS"), "MANAGE", "REFRESH")) === true, "ACQUISITIONS may run a refresh");
  assert((await checkAuthorized(principal("ANALYST"), "MANAGE", "REFRESH")) === false, "ANALYST may NOT run a refresh");
  assert((await checkAuthorized(principal("DISPOSITIONS"), "MANAGE", "REFRESH")) === false, "DISPOSITIONS may NOT run a refresh");
  for (const role of ["ADMIN", "ACQUISITIONS", "ANALYST", "DISPOSITIONS"]) {
    assert(can(role, "READ", "REFRESH") === true, `${role} may view refresh history`);
  }
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "authorization.denied" } })) >= 2, "denied refresh attempts were audited");

  console.log("\n[4] Org scoping:");
  assert((await listRefreshJobsForEntity(b.id, "OWNER", owner1.id)).length === 0, "org B sees none of org A's jobs");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
