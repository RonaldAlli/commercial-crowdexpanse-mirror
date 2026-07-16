// Visual-verification fixture seeder (v1.4 accordion slice). Runs under node + tsx exactly
// like the e2e-*.mjs scripts (so the app's `@/` imports resolve the proven way, never through
// Playwright's loader). It:
//   1. asserts the _test DB guardrail, then removes any prior visual org (idempotent),
//   2. seeds ONE throwaway org + ADMIN / CLOSING-writer / read-only users,
//   3. seeds three opportunities covering every required Closing Center state,
//   4. mints a Playwright storageState per user using the app's OWN signed-session format
//      (no auth bypass, no app change) — injected as a non-secure cookie for http localhost,
//   5. writes .artifacts/fixtures.json (ids + auth-state paths) for the specs.
// Everything is namespaced by the `e2e-visual` org slug so teardown is a single cascade delete.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { assertTestDatabase } from "../../scripts/e2e-guard.mjs";

import { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { hashPassword } from "../../lib/password.ts";
import { createPropertyRecord } from "../../lib/properties.ts";
import { ensureClosingChecklist, completeChecklistItem } from "../../lib/closing-service.ts";
import { openEscrow, markEscrowDeposited, resolveEscrow } from "../../lib/escrow-service.ts";
import { startFinancing, advanceFinancingStatus, setFinancingLender, resolveFinancing } from "../../lib/financing-service.ts";
import { startAssignment, setAssignmentParties, generateAssignmentDraft, executeAssignment } from "../../lib/assignment-service.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, ".artifacts");
const AUTH_DIR = join(ARTIFACTS, "auth");
const SLUG = "e2e-visual";
const PASSWORD = "visual-test-password";
const SESSION_COOKIE = "ce_commercial_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

// Long values to exercise wrapping/overflow on narrow screens.
const LONG_HOLDER = "First American Title Insurance Company of the Southeast — Regional Commercial Escrow Services Division, 191 Peachtree Street NE, Suite 2400, Atlanta, Georgia 30303";
const LONG_LENDER = "Metropolitan Community Development Bank & Trust — Commercial Real Estate Lending Group, Southeastern Regional Underwriting & Closing Office";
const LONG_BLOCKER = "Phase II Environmental Site Assessment — subsurface soil and groundwater sampling with full laboratory analysis, vapor-intrusion evaluation, and regulatory-agency coordination and sign-off";
const LONG_ASSIGNEE = "Southeastern Value-Add Multifamily Opportunity Fund IV, a Delaware limited partnership by its general partner SEVA Capital Management LLC";

assertTestDatabase();

const op = (name) => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOpp = async (orgId, title, propName) => {
  const prop = await createPropertyRecord(orgId, op(propName), {});
  const opp = await prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title, stage: "UNDER_CONTRACT" } });
  return { opp, propertyId: prop.id };
};

/** Build a valid signed session cookie exactly as lib/auth.ts createSession() does. */
function mintSession(userId, secret) {
  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}
function storageState(userId, secret) {
  return {
    cookies: [{
      name: SESSION_COOKIE,
      value: mintSession(userId, secret),
      domain: "127.0.0.1",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS - 60,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    }],
    origins: [],
  };
}

async function cleanup() {
  const stale = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const o of stale) await prisma.organization.delete({ where: { id: o.id } }).catch(() => {});
}

async function main() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET (>=16 chars) required — run with --env-file-if-exists=.env.test");

  await cleanup();
  mkdirSync(AUTH_DIR, { recursive: true });

  const org = await prisma.organization.create({ data: { name: "Visual Test Org", slug: `${SLUG}-${process.pid}` } });
  const mkUser = (name, email, role) =>
    prisma.user.create({ data: { organizationId: org.id, name, email: `${email}-${process.pid}@visual.test`, hashedPassword: hashPassword(PASSWORD), role } });
  const admin = await mkUser("Ada Admin", "admin", UserRole.ADMIN);
  const writer = await mkUser("Wes Writer", "writer", UserRole.ACQUISITIONS); // CLOSING write, non-admin
  const analyst = await mkUser("Rhea Readonly", "analyst", UserRole.ANALYST); // read-only for CLOSING

  // --- Opportunity 1: everything empty --------------------------------------
  const empty = (await mkOpp(org.id, "Riverbend Apartments (empty closing state)", "Riverbend Apartments")).opp;

  // --- Opportunity 2: active, with blockers + long values + underwriting ref -
  const activeSeed = await mkOpp(org.id, "Oakleaf Commons (active closing, blockers)", "Oakleaf Commons");
  const active = activeSeed.opp;
  const cl = await ensureClosingChecklist(org.id, active.id); // default required items left PENDING (blockers)
  await prisma.closingChecklistItem.create({
    data: { organizationId: org.id, checklistId: cl.id, category: "DUE_DILIGENCE", label: LONG_BLOCKER, required: true, completionEvidenceType: "DOCUMENT", position: 90, status: "PENDING" },
  });
  await openEscrow(org.id, active.id, admin.id, { earnestAmountUsd: 75000, escrowHolderName: LONG_HOLDER, escrowHolderContact: "commercial.escrow.southeast@firstam.example.com" });
  await markEscrowDeposited(org.id, active.id, admin.id); // DEPOSITED → ADMIN sees terminal resolve controls
  await startFinancing(org.id, active.id, admin.id);
  await setFinancingLender(org.id, active.id, admin.id, { lenderName: LONG_LENDER, lenderContact: "cre.underwriting@metrocommunity.example.com" });
  await advanceFinancingStatus(org.id, active.id, admin.id, "APPLIED");
  await advanceFinancingStatus(org.id, active.id, admin.id, "COMMITTED");
  await advanceFinancingStatus(org.id, active.id, admin.id, "CLEARED"); // CLEARED → ADMIN sees Resolve: Funded/Denied/Withdrawn
  // Active underwriting reference (FC-0): a minimal LOCKED scenario with a primary financing case result.
  const uw = await prisma.underwriting.create({ data: { organizationId: org.id, opportunityId: active.id, propertyId: activeSeed.propertyId } });
  const scenario = await prisma.underwritingScenario.create({
    data: { organizationId: org.id, underwritingId: uw.id, label: "Base Case", version: 1, status: "LOCKED", modelVersion: 1, calcLibVersion: 1, rulesetVersion: 1, scenarioVersion: "visual-seed-scenario-v1" },
  });
  await prisma.underwriting.update({ where: { id: uw.id }, data: { activeScenarioId: scenario.id } });
  const fc = await prisma.financingCase.create({
    data: { organizationId: org.id, scenarioId: scenario.id, label: "Senior Debt", position: 0, source: "MANUAL", financingCaseVersion: "visual-seed-fc-v1" },
  });
  await prisma.financingCaseResult.create({
    data: { organizationId: org.id, financingCaseId: fc.id, financingCaseVersion: "visual-seed-fc-v1", calcLibVersion: 1, sizedLoanUsd: 4200000, dscr: 1.35, debtYieldPct: 9.2, bindingConstraint: "DSCR" },
  });
  // Assignment in the DRAFTED state (with a generated draft + long assignee to exercise wrapping);
  // an ADMIN viewer sees the Execute control, a non-admin sees the admin-only note.
  await prisma.opportunity.update({ where: { id: active.id }, data: { contractValueUsd: 6_500_000, assignmentFeeUsd: 185_000 } });
  await startAssignment(org.id, active.id, admin.id);
  await setAssignmentParties(org.id, active.id, admin.id, { assignorName: "Oakleaf Holdings LLC", assignorContact: "seller@oakleaf.example", assigneeName: LONG_ASSIGNEE, assigneeContact: "acquisitions@seva-capital.example.com" });
  await generateAssignmentDraft(org.id, active.id, { id: admin.id, display: admin.name });
  await generateAssignmentDraft(org.id, active.id, { id: admin.id, display: admin.name }); // a second versioned draft (AS-M)
  // An OVERDUE target close (past 2026-07-16) so the Transaction Dashboard shows an overdue milestone.
  await prisma.opportunity.update({ where: { id: active.id }, data: { targetCloseDate: new Date("2026-07-05T00:00:00.000Z") } });

  // --- Opportunity 3: ready + terminal escrow & financing -------------------
  const terminal = (await mkOpp(org.id, "Summit Ridge Portfolio (ready, terminal states)", "Summit Ridge Portfolio")).opp;
  const tcl = await ensureClosingChecklist(org.id, terminal.id);
  for (const it of tcl.items.filter((i) => i.required)) await completeChecklistItem(org.id, it.id, admin.id); // ready
  await openEscrow(org.id, terminal.id, admin.id, { earnestAmountUsd: 120000, escrowHolderName: "Peachtree Escrow LLC" });
  await markEscrowDeposited(org.id, terminal.id, admin.id);
  await resolveEscrow(org.id, terminal.id, admin.id, "RELEASED", "Applied to purchase at closing");
  await startFinancing(org.id, terminal.id, admin.id);
  await setFinancingLender(org.id, terminal.id, admin.id, { lenderName: "Regions Commercial Bank" });
  await advanceFinancingStatus(org.id, terminal.id, admin.id, "APPLIED");
  await advanceFinancingStatus(org.id, terminal.id, admin.id, "COMMITTED");
  await advanceFinancingStatus(org.id, terminal.id, admin.id, "CLEARED");
  await resolveFinancing(org.id, terminal.id, admin.id, "FUNDED", "Loan funded at closing");
  // Assignment in the EXECUTED terminal state — the immutable executed-terms snapshot renders.
  await prisma.opportunity.update({ where: { id: terminal.id }, data: { contractValueUsd: 9_250_000, assignmentFeeUsd: 250_000 } });
  await startAssignment(org.id, terminal.id, admin.id);
  await setAssignmentParties(org.id, terminal.id, admin.id, { assignorName: "Summit Ridge Sellers LP", assigneeName: "Blue Harbor Real Estate Partners" });
  await generateAssignmentDraft(org.id, terminal.id, { id: admin.id, display: admin.name });
  await executeAssignment(org.id, terminal.id, admin.id, "Executed and recorded at closing");
  // An UPCOMING target close (future) so the Transaction Dashboard shows an upcoming milestone.
  await prisma.opportunity.update({ where: { id: terminal.id }, data: { targetCloseDate: new Date("2026-12-01T00:00:00.000Z") } });

  // --- storageState per user + manifest -------------------------------------
  const authFiles = {};
  for (const [key, u] of Object.entries({ admin, writer, analyst })) {
    const file = join(AUTH_DIR, `${key}.json`);
    writeFileSync(file, JSON.stringify(storageState(u.id, secret), null, 2));
    authFiles[key] = file;
  }

  const manifest = {
    orgId: org.id,
    slug: org.slug,
    auth: authFiles,
    users: { admin: admin.id, writer: writer.id, analyst: analyst.id },
    opportunities: { empty: empty.id, active: active.id, terminal: terminal.id },
  };
  writeFileSync(join(ARTIFACTS, "fixtures.json"), JSON.stringify(manifest, null, 2));
  console.log(`[visual-seed] org=${org.slug} empty=${empty.id} active=${active.id} terminal=${terminal.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error("[visual-seed] FAILED:", e); await prisma.$disconnect(); process.exit(1); });
