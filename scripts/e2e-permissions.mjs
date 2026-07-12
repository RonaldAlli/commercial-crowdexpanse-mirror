// Focused E2E for the role-based permission layer (Slice 1).
//
// Two parts:
//   A. PURE POLICY — exercises can() and canMoveStage() from lib/permissions as a
//      truth table. No DB. This is the single source of truth for who may do what,
//      including the seven required pipeline-movement cases.
//   B. ENFORCEMENT + AUDIT — drives the REAL lib/authorize functions
//      (checkAuthorized / authorize / authorizeStageMove) against a throwaway org
//      on the *_test DB, proving: denials throw / return false, an
//      authorization.denied ActivityLog row is written on every denial (with
//      role/resource/action in the body), allowed operations are silent, and the
//      audit write is org-scoped. Throwaway orgs are cascade-cleaned at the end.
import { PrismaClient, UserRole, OpportunityStage, AssetType } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { can, canMoveStage } from "../lib/permissions.ts";
import {
  checkAuthorized,
  authorize,
  authorizeStageMove,
  checkStageMove,
  AuthorizationError,
  GENERIC_DENIAL,
} from "../lib/authorize.ts";

const prisma = new PrismaClient();

const TAG = "e2e-permissions";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;
const S = OpportunityStage; // shorthand for stage constants

// ── Part A: pure policy truth table (no DB) ─────────────────────────────────
console.log("[A] Pure policy — can():");
// Sellers/properties/opportunities: Acquisitions write, Analyst/Dispositions read-only.
assert(can(ACQUISITIONS, "DELETE", "SELLER") === true, "ACQUISITIONS may DELETE SELLER");
assert(can(ADMIN, "DELETE", "SELLER") === true, "ADMIN may DELETE SELLER");
assert(can(ANALYST, "DELETE", "SELLER") === false, "ANALYST may NOT DELETE SELLER");
assert(can(DISPOSITIONS, "DELETE", "OPPORTUNITY") === false, "DISPOSITIONS may NOT DELETE OPPORTUNITY");
assert(can(ANALYST, "READ", "SELLER") === true, "ANALYST may READ SELLER (read-only)");
// Buyers / matches: Dispositions write, Acquisitions/Analyst read-only.
assert(can(DISPOSITIONS, "DELETE", "BUYER_MATCH") === true, "DISPOSITIONS may DELETE BUYER_MATCH");
assert(can(ACQUISITIONS, "DELETE", "BUYER_MATCH") === false, "ACQUISITIONS may NOT DELETE BUYER_MATCH");
assert(can(ADMIN, "DELETE", "BUYER") === true, "ADMIN may DELETE BUYER");
// Deal analysis: Analyst writes.
assert(can(ANALYST, "UPDATE", "DEAL_ANALYSIS") === true, "ANALYST may UPDATE DEAL_ANALYSIS");
assert(can(ACQUISITIONS, "UPDATE", "DEAL_ANALYSIS") === false, "ACQUISITIONS may NOT UPDATE DEAL_ANALYSIS");
// Tasks/notes/documents: every role may write (uniform, still audited on denial-path never reached).
for (const role of [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS]) {
  assert(can(role, "DELETE", "TASK") === true, `${role} may DELETE TASK`);
}
// Team / invitations: ADMIN only.
assert(can(ADMIN, "MANAGE", "TEAM") === true, "ADMIN may MANAGE TEAM");
assert(can(ACQUISITIONS, "MANAGE", "TEAM") === false, "ACQUISITIONS may NOT MANAGE TEAM");
assert(can(DISPOSITIONS, "MANAGE", "INVITATION") === false, "DISPOSITIONS may NOT MANAGE INVITATION");

console.log("\n[A] Pure policy — can() CREATE/UPDATE (Slice 2):");
// Create/update share the resource's write set — same as delete.
assert(can(ACQUISITIONS, "CREATE", "SELLER") === true, "ACQUISITIONS may CREATE SELLER");
assert(can(ANALYST, "CREATE", "SELLER") === false, "ANALYST may NOT CREATE SELLER");
assert(can(ACQUISITIONS, "UPDATE", "PROPERTY") === true, "ACQUISITIONS may UPDATE PROPERTY");
assert(can(DISPOSITIONS, "CREATE", "OPPORTUNITY") === false, "DISPOSITIONS may NOT CREATE OPPORTUNITY");
assert(can(DISPOSITIONS, "CREATE", "BUYER") === true, "DISPOSITIONS may CREATE BUYER");
assert(can(ANALYST, "UPDATE", "BUYER") === false, "ANALYST may NOT UPDATE BUYER");
assert(can(DISPOSITIONS, "CREATE", "BUYER_MATCH") === true, "DISPOSITIONS may CREATE BUYER_MATCH (generate)");
assert(can(ACQUISITIONS, "UPDATE", "BUYER_MATCH") === false, "ACQUISITIONS may NOT UPDATE BUYER_MATCH");
assert(can(ADMIN, "CREATE", "DEAL_ANALYSIS") === true, "ADMIN may CREATE DEAL_ANALYSIS");
assert(can(DISPOSITIONS, "UPDATE", "DEAL_ANALYSIS") === false, "DISPOSITIONS may NOT UPDATE DEAL_ANALYSIS");
for (const role of [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS]) {
  assert(can(role, "CREATE", "NOTE") === true && can(role, "UPDATE", "DOCUMENT") === true, `${role} may CREATE NOTE + UPDATE DOCUMENT (all roles)`);
}

console.log("\n[A] Pure policy — canMoveStage() (7 required cases):");
// 1. Dispositions cannot jump the whole pipeline LEAD -> PAID.
assert(canMoveStage(DISPOSITIONS, S.LEAD, S.PAID) === false, "1) DISPOSITIONS cannot move LEAD → PAID");
// 2. Acquisitions cannot move beyond UNDER_CONTRACT.
assert(canMoveStage(ACQUISITIONS, S.UNDER_CONTRACT, S.CLOSING) === false, "2) ACQUISITIONS cannot move UNDER_CONTRACT → CLOSING (beyond UC)");
assert(canMoveStage(ACQUISITIONS, S.LOI_SENT, S.BUYER_MATCHED) === false, "2b) ACQUISITIONS cannot land past UC (LOI_SENT → BUYER_MATCHED)");
// 3. Dispositions cannot act before UNDER_CONTRACT.
assert(canMoveStage(DISPOSITIONS, S.LEAD, S.SELLER_CONTACTED) === false, "3) DISPOSITIONS cannot move before UC (LEAD → SELLER_CONTACTED)");
assert(canMoveStage(DISPOSITIONS, S.OFFER_READY, S.UNDER_CONTRACT) === false, "3b) DISPOSITIONS cannot act from a pre-UC stage (OFFER_READY → UNDER_CONTRACT)");
// 4. Analyst cannot move any stage.
assert(canMoveStage(ANALYST, S.LEAD, S.SELLER_CONTACTED) === false, "4) ANALYST cannot move any stage (LEAD → SELLER_CONTACTED)");
assert(canMoveStage(ANALYST, S.UNDER_CONTRACT, S.CLOSING) === false, "4b) ANALYST cannot move any stage (UNDER_CONTRACT → CLOSING)");
// 5. Correct forward movement within each role's band succeeds.
assert(canMoveStage(ACQUISITIONS, S.LEAD, S.SELLER_CONTACTED) === true, "5a) ACQUISITIONS forward within band (LEAD → SELLER_CONTACTED)");
assert(canMoveStage(ACQUISITIONS, S.OFFER_READY, S.UNDER_CONTRACT) === true, "5b) ACQUISITIONS may reach the UC handoff (OFFER_READY → UNDER_CONTRACT)");
assert(canMoveStage(DISPOSITIONS, S.UNDER_CONTRACT, S.BUYER_MATCHED) === true, "5c) DISPOSITIONS forward within band (UNDER_CONTRACT → BUYER_MATCHED)");
assert(canMoveStage(DISPOSITIONS, S.CLOSING, S.PAID) === true, "5d) DISPOSITIONS forward within band (CLOSING → PAID)");
// 6. ADMIN succeeds for any valid movement (including across the whole pipeline).
assert(canMoveStage(ADMIN, S.LEAD, S.PAID) === true, "6a) ADMIN may move LEAD → PAID");
assert(canMoveStage(ADMIN, S.CLOSING, S.LEAD) === true, "6b) ADMIN may move backward (CLOSING → LEAD)");
// 7. Backward moves are rejected for non-admins.
assert(canMoveStage(ACQUISITIONS, S.UNDER_CONTRACT, S.LEAD) === false, "7a) ACQUISITIONS cannot move backward (UNDER_CONTRACT → LEAD)");
assert(canMoveStage(DISPOSITIONS, S.CLOSING, S.UNDER_CONTRACT) === false, "7b) DISPOSITIONS cannot move backward (CLOSING → UNDER_CONTRACT)");
// Unknown / same-stage sanity.
assert(canMoveStage(ADMIN, S.LEAD, S.LEAD) === true, "same-stage self-move is trivially allowed for ADMIN");

// ── Part B: real enforcement + audit against the *_test DB ──────────────────
async function seedOrg(slug) {
  const org = await prisma.organization.create({ data: { name: TAG, slug } });
  const mk = (role, tag) => prisma.user.create({
    data: { organizationId: org.id, name: `${tag} ${role}`, email: `${slug}-${tag}@example.test`, hashedPassword: "x", role },
  });
  const admin = await mk(ADMIN, "admin");
  const acq = await mk(ACQUISITIONS, "acq");
  const analyst = await mk(ANALYST, "analyst");
  const dispo = await mk(DISPOSITIONS, "dispo");
  // A real property + opportunity so denial audit rows link a valid FK, exactly
  // as production does (moveOpportunityStage passes the real opportunity id).
  const property = await prisma.property.create({
    data: { organizationId: org.id, name: "Test Asset", assetType: AssetType.MULTIFAMILY, addressLine1: "1 Main St", city: "Atlanta", state: "GA" },
  });
  const opportunity = await prisma.opportunity.create({
    data: { organizationId: org.id, propertyId: property.id, title: "Test Opportunity" },
  });
  return { org, admin, acq, analyst, dispo, property, opportunity };
}

const principal = (u) => ({ id: u.id, role: u.role, organizationId: u.organizationId });
const deniedCount = (orgId) =>
  prisma.activityLog.count({ where: { organizationId: orgId, eventType: "authorization.denied" } });

const orgIds = [];
try {
  console.log("\n[B] Seeding throwaway org A (one user per role)...");
  const a = await seedOrg(`${TAG}-${process.pid}-a`);
  orgIds.push(a.org.id);
  console.log("[B] Seeding throwaway org B (audit-scoping control)...");
  const b = await seedOrg(`${TAG}-${process.pid}-b`);
  orgIds.push(b.org.id);

  console.log("\n[B1] checkAuthorized — denial returns false and logs:");
  const before = await deniedCount(a.org.id);
  const analystDelete = await checkAuthorized(principal(a.analyst), "DELETE", "SELLER", { targetId: "seller-x" });
  assert(analystDelete === false, "ANALYST DELETE SELLER → checkAuthorized returns false");
  const after1 = await deniedCount(a.org.id);
  assert(after1 === before + 1, "one authorization.denied row written on the denial");

  console.log("\n[B2] Denial audit row carries role/resource/action in its body:");
  const row = await prisma.activityLog.findFirst({
    where: { organizationId: a.org.id, eventType: "authorization.denied", actorId: a.analyst.id },
    orderBy: { createdAt: "desc" },
  });
  const body = row ? JSON.parse(row.eventBody) : {};
  assert(body.role === ANALYST && body.resource === "SELLER" && body.action === "DELETE", "audit body records {role, resource, action}");
  assert(body.targetId === "seller-x", "audit body records the targetId");

  console.log("\n[B3] checkAuthorized — allowed operation is silent (no log):");
  const beforeAllowed = await deniedCount(a.org.id);
  const acqDelete = await checkAuthorized(principal(a.acq), "DELETE", "SELLER", { targetId: "seller-y" });
  assert(acqDelete === true, "ACQUISITIONS DELETE SELLER → checkAuthorized returns true");
  assert((await deniedCount(a.org.id)) === beforeAllowed, "no authorization.denied row for an allowed op");

  console.log("\n[B4] authorize — throws AuthorizationError with the generic message:");
  let threw = null;
  try {
    await authorize(principal(a.analyst), "DELETE", "OPPORTUNITY", { targetId: a.opportunity.id, opportunityId: a.opportunity.id });
  } catch (e) { threw = e; }
  assert(threw instanceof AuthorizationError, "authorize() throws AuthorizationError on denial");
  assert(threw?.message === GENERIC_DENIAL, "thrown error carries the generic denial message");

  console.log("\n[B5] authorize — allowed op does NOT throw:");
  let allowedThrew = false;
  try {
    await authorize(principal(a.admin), "DELETE", "OPPORTUNITY", { targetId: a.opportunity.id, opportunityId: a.opportunity.id });
  } catch { allowedThrew = true; }
  assert(allowedThrew === false, "ADMIN DELETE OPPORTUNITY does not throw");

  console.log("\n[B6] authorizeStageMove — enforces the segment rule + logs a PIPELINE denial:");
  const beforeMove = await deniedCount(a.org.id);
  let moveThrew = null;
  try {
    await authorizeStageMove(principal(a.dispo), S.LEAD, S.PAID, { opportunityId: a.opportunity.id });
  } catch (e) { moveThrew = e; }
  assert(moveThrew instanceof AuthorizationError, "DISPOSITIONS LEAD → PAID move throws AuthorizationError");
  const moveRow = await prisma.activityLog.findFirst({
    where: { organizationId: a.org.id, eventType: "authorization.denied", actorId: a.dispo.id },
    orderBy: { createdAt: "desc" },
  });
  const moveBody = moveRow ? JSON.parse(moveRow.eventBody) : {};
  assert((await deniedCount(a.org.id)) === beforeMove + 1, "one authorization.denied row written for the blocked move");
  assert(moveBody.resource === "PIPELINE" && moveBody.action === "MOVE_STAGE", "move denial body records PIPELINE / MOVE_STAGE");
  assert(moveBody.detail === `${S.LEAD} -> ${S.PAID}`, "move denial body records the current -> target detail");

  console.log("\n[B7] authorizeStageMove — a legal in-band move does not throw:");
  let legalThrew = false;
  try {
    await authorizeStageMove(principal(a.acq), S.LEAD, S.SELLER_CONTACTED, { opportunityId: a.opportunity.id });
  } catch { legalThrew = true; }
  assert(legalThrew === false, "ACQUISITIONS LEAD → SELLER_CONTACTED does not throw");

  console.log("\n[B8] Audit is org-scoped — org B saw none of org A's denials:");
  assert((await deniedCount(b.org.id)) === 0, "org B has zero authorization.denied rows");

  console.log("\n[B9] Create/update enforcement (allow + deny + audit) — Slice 2:");
  // DEAL_ANALYSIS: ANALYST writes, ACQUISITIONS denied.
  assert((await checkAuthorized(principal(a.analyst), "UPDATE", "DEAL_ANALYSIS", { opportunityId: a.opportunity.id })) === true, "ANALYST UPDATE DEAL_ANALYSIS allowed");
  const beforeCU = await deniedCount(a.org.id);
  assert((await checkAuthorized(principal(a.acq), "UPDATE", "DEAL_ANALYSIS", { opportunityId: a.opportunity.id })) === false, "ACQUISITIONS UPDATE DEAL_ANALYSIS denied");
  // BUYER_MATCH generate (CREATE): DISPOSITIONS writes, ANALYST denied.
  assert((await checkAuthorized(principal(a.dispo), "CREATE", "BUYER_MATCH", { opportunityId: a.opportunity.id })) === true, "DISPOSITIONS CREATE BUYER_MATCH allowed");
  assert((await checkAuthorized(principal(a.analyst), "CREATE", "BUYER_MATCH", { opportunityId: a.opportunity.id })) === false, "ANALYST CREATE BUYER_MATCH denied");
  // SELLER create: ACQUISITIONS writes, DISPOSITIONS denied.
  assert((await checkAuthorized(principal(a.acq), "CREATE", "SELLER")) === true, "ACQUISITIONS CREATE SELLER allowed");
  assert((await checkAuthorized(principal(a.dispo), "CREATE", "SELLER")) === false, "DISPOSITIONS CREATE SELLER denied");
  assert((await deniedCount(a.org.id)) === beforeCU + 3, "exactly 3 denial rows for the 3 denied create/update attempts");

  console.log("\n[B10] Opportunity edit-path stage change enforced (whole update rejected):");
  const beforeEdit = await deniedCount(a.org.id);
  // ACQUISITIONS editing an opp and pushing stage past UNDER_CONTRACT is rejected;
  // updateOpportunity turns this false into a full-update denial.
  assert((await checkStageMove(principal(a.acq), S.UNDER_CONTRACT, S.CLOSING, { opportunityId: a.opportunity.id })) === false, "ACQUISITIONS edit pushing UNDER_CONTRACT → CLOSING rejected");
  assert((await deniedCount(a.org.id)) === beforeEdit + 1, "the rejected edit-path move logs one PIPELINE denial");
  assert((await checkStageMove(principal(a.acq), S.LEAD, S.UNDERWRITING, { opportunityId: a.opportunity.id })) === true, "ACQUISITIONS in-band edit stage change allowed");

  console.log("\n[B11] Submit-only audit invariant — pure can()/canMoveStage() never log:");
  const beforePure = await deniedCount(a.org.id);
  // The UI-hiding + route-guard layer uses the pure policy, so page loads never audit.
  for (let i = 0; i < 5; i++) {
    can(a.analyst.role, "DELETE", "SELLER");     // would-deny
    can(a.dispo.role, "CREATE", "OPPORTUNITY");  // would-deny
    canMoveStage(a.analyst.role, S.LEAD, S.PAID); // would-deny
  }
  assert((await deniedCount(a.org.id)) === beforePure, "pure policy checks write NO authorization.denied rows");

  console.log("\n[B12] Denied-action reporting query (ADMIN read surface):");
  const report = await prisma.activityLog.findMany({
    where: { organizationId: a.org.id, eventType: "authorization.denied" },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  assert(report.length > 0, "reporting query returns org A's denied rows");
  const allParsable = report.every((r) => {
    try { const b = JSON.parse(r.eventBody); return Boolean(b.resource) && Boolean(b.action); } catch { return false; }
  });
  assert(allParsable, "every denied row exposes resource + action in its body");
  const counts = new Map();
  for (const r of report) counts.set(r.actorId, (counts.get(r.actorId) ?? 0) + 1);
  assert(counts.size >= 1 && [...counts.values()].every((n) => n >= 1), "count-by-actor aggregation is well-formed");
  const reportB = await prisma.activityLog.findMany({ where: { organizationId: b.org.id, eventType: "authorization.denied" } });
  assert(reportB.length === 0, "reporting query is org-scoped (org B empty)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
