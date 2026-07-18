// Wave 5 — CRM integration/boundary tests (roadmap restoration). DB-backed, throwaway orgs.
// Reproduces the ACCEPTED rules from code+schema (does not invent new lifecycles):
//   • single-primary-per-Owner invariant (application-enforced in owners/actions.ts via a
//     transaction: updateMany unset {organizationId, ownerId} → set the target primary; there is
//     NO schema-level @@unique on primary — so concurrency is probed + documented, not migrated);
//   • diligence + outreach statuses are FREE-FORM (any valid enum value is settable directly);
//   • CRM↔Underwriting boundary (CRM/diligence writes no underwriting rows);
//   • delete-no-orphan (Owner delete cascades its contacts).
import { assertTestDatabase } from "./e2e-guard.mjs";

import { OpportunityDiligenceStatus, ContactOutreachStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.ts";
import { createPropertyRecord } from "../lib/properties.ts";
import { ensureOpportunityDiligence } from "../lib/opportunity-diligence-service.ts";

const TAG = "e2e-crm-integration";
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
const mkContact = (orgId, ownerId, name, isPrimary = false) => prisma.ownerContact.create({ data: { organizationId: orgId, ownerId, contactName: name, isPrimary } });
const primaryCount = (ownerId) => prisma.ownerContact.count({ where: { ownerId, isPrimary: true } });

// Faithful reproduction of the accepted make-primary transaction (owners/actions.ts update path).
const makePrimary = (orgId, ownerId, contactId) =>
  prisma.$transaction(async (tx) => {
    await tx.ownerContact.updateMany({ where: { organizationId: orgId, ownerId, id: { not: contactId } }, data: { isPrimary: false } });
    await tx.ownerContact.update({ where: { id: contactId }, data: { isPrimary: true } });
  });

const orgIds = [];
try {
  const a = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const ownerA = await mkOwner(a.id, "Alpha Holdings");

  console.log("\n[1] Single-primary-per-Owner invariant (sequential — the accepted rule):");
  const c1 = await mkContact(a.id, ownerA.id, "C1", true);
  const c2 = await mkContact(a.id, ownerA.id, "C2");
  const c3 = await mkContact(a.id, ownerA.id, "C3");
  assert((await primaryCount(ownerA.id)) === 1, "one primary after seeding (c1)");
  await makePrimary(a.id, ownerA.id, c2.id);
  assert((await primaryCount(ownerA.id)) === 1, "still exactly one primary after switching to c2");
  assert((await prisma.ownerContact.findUnique({ where: { id: c2.id } })).isPrimary === true && (await prisma.ownerContact.findUnique({ where: { id: c1.id } })).isPrimary === false, "c2 is primary, c1 was unset");
  void c3;

  console.log("\n[2] Concurrency PROBE (documented risk — no schema @@unique on primary):");
  // Two near-simultaneous make-primary ops. The app-level transaction guarantees each op is
  // atomic, but NOT mutual exclusion across concurrent ops. We OBSERVE + report; a value > 1
  // confirms the documented D-CRM-PRIMARY-CONCURRENCY risk (a schema constraint would be a
  // separately-reviewed migration, NOT done here).
  const cx = await mkContact(a.id, ownerA.id, "CX");
  const cy = await mkContact(a.id, ownerA.id, "CY");
  const results = await Promise.allSettled([makePrimary(a.id, ownerA.id, cx.id), makePrimary(a.id, ownerA.id, cy.id)]);
  const settled = results.filter((r) => r.status === "fulfilled").length;
  const observed = await primaryCount(ownerA.id);
  console.log(`    concurrent make-primary → ${settled}/2 committed · observed primaries = ${observed}`);
  assert(observed >= 1, "at least one primary exists after concurrent ops (invariant is restorable)");
  // Restorability: a subsequent sequential make-primary always re-establishes exactly one.
  await makePrimary(a.id, ownerA.id, cx.id);
  assert((await primaryCount(ownerA.id)) === 1, "a sequential make-primary restores exactly one primary");
  if (observed > 1) console.log("    NOTE: concurrency left >1 primary — confirms D-CRM-PRIMARY-CONCURRENCY (documented risk, no migration in Wave 5).");

  console.log("\n[3] Diligence status is free-form (accepted behavior — any valid status settable):");
  const prop = await createPropertyRecord(a.id, op("Deal A"), {});
  const oppA = await prisma.opportunity.create({ data: { organizationId: a.id, propertyId: prop.id, title: "Deal A" } });
  await ensureOpportunityDiligence(a.id, oppA.id);
  // Set REVIEWED directly without passing through REQUESTED/RECEIVED — the app permits this.
  await prisma.opportunityDiligenceItem.updateMany({ where: { opportunityId: oppA.id, organizationId: a.id, key: "t12" }, data: { status: OpportunityDiligenceStatus.REVIEWED } });
  const t12 = await prisma.opportunityDiligenceItem.findFirst({ where: { opportunityId: oppA.id, key: "t12" } });
  assert(t12.status === "REVIEWED", "a diligence item can be set REVIEWED directly (no enforced sequential transition)");

  console.log("\n[4] CRM↔Underwriting boundary — CRM/diligence writes NO underwriting state:");
  const [uw, sr, ud] = await Promise.all([
    prisma.underwriting.count({ where: { opportunityId: oppA.id } }),
    prisma.scenarioResult.count({ where: { organizationId: a.id } }),
    prisma.underwritingDecision.count({ where: { organizationId: a.id } }),
  ]);
  assert(uw === 0 && sr === 0 && ud === 0, "no Underwriting / ScenarioResult / UnderwritingDecision created by CRM work");

  console.log("\n[5] Outreach status is free-form (accepted behavior):");
  const oc = await prisma.ownerContact.update({ where: { id: c1.id }, data: { outreachStatus: ContactOutreachStatus.QUALIFIED } });
  assert(oc.outreachStatus === "QUALIFIED", "an outreach status can be set directly to any valid value");

  console.log("\n[6] Delete-no-orphan — deleting an Owner cascades its contacts:");
  const owner2 = await mkOwner(a.id, "Gamma Holdings");
  await mkContact(a.id, owner2.id, "G1");
  await prisma.owner.delete({ where: { id: owner2.id } });
  assert((await prisma.ownerContact.count({ where: { ownerId: owner2.id } })) === 0, "owner delete left no orphan contacts (onDelete: Cascade)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
