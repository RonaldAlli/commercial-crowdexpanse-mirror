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
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
