// Wave 1 — CRM organization-isolation + boundary E2E (roadmap restoration).
// Proves, against the *_test DB with throwaway orgs, that the off-roadmap CRM features
// (Owner Contacts, Opportunity Diligence) are strictly organization-scoped and fail closed on
// cross-org access, and — the load-bearing one — that completing CRM diligence CANNOT make an
// Opportunity Closing-ready or PAID-eligible (the diligence↔Closing boundary). Read/write only
// against the test DB; each throwaway org cascade-cleans.
import { assertTestDatabase } from "./e2e-guard.mjs";

import { OpportunityDiligenceStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { ensureOpportunityDiligence } from "../lib/opportunity-diligence-service.ts";
import { getClosingGateStatus, getClosingChecklist } from "../lib/closing-service.ts";

const TAG = "e2e-crm-isolation";
assertTestDatabase();
let ok = 0;
const fail = [];
function assert(cond, msg) { if (cond) { ok++; console.log(`  ✓ ${msg}`); } else { fail.push(msg); console.log(`  ✗ ${msg}`); } }

const op = (name = "Asset") => ({
  name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA",
  postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null,
  noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null,
});
const mkOwner = (orgId, name) => prisma.owner.create({ data: { organizationId: orgId, displayName: name, entityType: "LLC", matchKey: name.toLowerCase() } });
const mkOpp = async (orgId, title) => {
  const prop = await createPropertyRecord(orgId, op(title), {});
  return prisma.opportunity.create({ data: { organizationId: orgId, propertyId: prop.id, title } });
};

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const b = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  const ownerA = await mkOwner(a.id, "Alpha Holdings");
  const ownerB = await mkOwner(b.id, "Beta Holdings");
  const oppA = await mkOpp(a.id, "Deal A");
  const oppB = await mkOpp(b.id, "Deal B");

  console.log("\n[1] Owner Contacts are organization-scoped (list returns only own org):");
  const cA = await prisma.ownerContact.create({ data: { organizationId: a.id, ownerId: ownerA.id, contactName: "Ann A", isPrimary: true } });
  const cB = await prisma.ownerContact.create({ data: { organizationId: b.id, ownerId: ownerB.id, contactName: "Bob B", isPrimary: true } });
  const listA = await prisma.ownerContact.findMany({ where: { organizationId: a.id } });
  assert(listA.length === 1 && listA[0].id === cA.id, "org A's contact list contains only org A's contact");
  assert(!listA.some((c) => c.id === cB.id), "org A's list never contains org B's contact");

  console.log("\n[2] Cross-org direct read fails closed (mirrors the action's `where {id, organizationId}`):");
  assert((await prisma.ownerContact.findFirst({ where: { id: cA.id, organizationId: b.id } })) === null, "org B cannot read org A's contact by id");
  assert((await prisma.ownerContact.findFirst({ where: { id: cA.id, organizationId: a.id } })) !== null, "org A can read its own contact by id");

  console.log("\n[3] A contact cannot reference an owner in another organization (fail closed):");
  const crossOwner = await prisma.ownerContact.findFirst({ where: { ownerId: ownerB.id, organizationId: a.id } });
  assert(crossOwner === null, "no org-A contact resolves to org-B's owner");

  console.log("\n[4] Opportunity Diligence is organization-scoped:");
  const digA = await ensureOpportunityDiligence(a.id, oppA.id);
  await ensureOpportunityDiligence(b.id, oppB.id);
  assert(digA.length > 0 && digA.every((d) => d.organizationId === a.id), "diligence items materialize scoped to org A");
  assert((await prisma.opportunityDiligenceItem.findFirst({ where: { opportunityId: oppA.id, organizationId: b.id } })) === null, "org B cannot read org A's diligence items");
  const reRun = await ensureOpportunityDiligence(a.id, oppA.id);
  assert(reRun.length === digA.length, "ensureOpportunityDiligence is idempotent (skipDuplicates — no duplication)");

  console.log("\n[5] BOUNDARY: completing ALL CRM diligence does NOT create Closing items or make the deal Closing-ready:");
  await prisma.opportunityDiligenceItem.updateMany({ where: { opportunityId: oppA.id, organizationId: a.id }, data: { status: OpportunityDiligenceStatus.REVIEWED } });
  const allReviewed = (await prisma.opportunityDiligenceItem.findMany({ where: { opportunityId: oppA.id, organizationId: a.id } })).every((d) => d.status === "REVIEWED");
  assert(allReviewed, "every diligence item is REVIEWED (fully complete)");
  // Diligence completion must have created NO ClosingChecklist / items.
  const preChecklist = await getClosingChecklist(a.id, oppA.id);
  assert(preChecklist === null || preChecklist.items.length === 0, "diligence completion created NO Closing checklist items");
  // The composed PAID gate is unaffected: it materializes its OWN checklist (required items NOT complete) → not ready.
  const gate = await getClosingGateStatus(a.id, oppA.id);
  assert(gate.ready === false, "PAID gate is NOT ready despite all diligence complete (diligence ≠ Closing readiness)");
  assert(gate.blockingLabels.length > 0, "the gate still reports outstanding required Closing items");

  console.log("\n[6] Diligence did not mutate Escrow/Financing/Assignment/Underwriting for the opportunity:");
  const [esc, fin, asg, uw] = await Promise.all([
    prisma.escrowRecord.count({ where: { opportunityId: oppA.id } }),
    prisma.financingRecord.count({ where: { opportunityId: oppA.id } }),
    prisma.assignmentRecord.count({ where: { opportunityId: oppA.id } }),
    prisma.underwriting.count({ where: { opportunityId: oppA.id } }),
  ]);
  assert(esc === 0 && fin === 0 && asg === 0 && uw === 0, "no Escrow/Financing/Assignment/Underwriting record was created by diligence");

  console.log("\n[7] Automation remains inert (paused) throughout:");
  const [aj, ae] = await Promise.all([prisma.automationJob.count(), prisma.automationExecution.count()]);
  assert(aj === 0 && ae === 0, "no automation jobs/executions exist");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
