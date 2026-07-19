// Opportunity Pipeline audit — RUNTIME reproduction of the ownership inconsistencies (OWN-2, OWN-3).
// Read/writes ONLY the test DB via throwaway orgs. Proves the findings are real in practice, not
// inferred. "confirmed" = the inconsistency reproduced as described (this documents current behavior;
// OWN-2/OWN-3 are design decisions, not auto-fixes).
import { assertTestDatabase } from "../e2e-guard.mjs";
import { OpportunityDiligenceStatus, OpportunityStage } from "@prisma/client";

import { prisma } from "../../lib/prisma.ts";
import { createPropertyRecord } from "../../lib/properties.ts";
import { ensureOpportunityDiligence } from "../../lib/opportunity-diligence-service.ts";
import { ensureClosingChecklist, getClosingGateStatus } from "../../lib/closing-service.ts";

const TAG = "audit-pipeline-ownership";
assertTestDatabase();
let ok = 0; const fail = [];
const confirm = (cond, msg) => { if (cond) { ok++; console.log(`  ✓ CONFIRMED: ${msg}`); } else { fail.push(msg); console.log(`  ✗ NOT reproduced: ${msg}`); } };

const propInput = (name) => ({ name, assetType: "MULTIFAMILY", status: null, addressLine1: "1 Main St", city: "Atlanta", state: "GA", postalCode: null, county: null, sellerId: null, unitCount: null, acreage: null, occupancyRate: null, noiAnnualUsd: null, askingPriceUsd: null, estimatedValueUsd: null, capRate: null });

const orgIds = [];
try {
  const org = await prisma.organization.create({ data: { name: TAG, slug: `${TAG}-${process.pid}` } });
  orgIds.push(org.id);

  // ================= OWN-2: stage vs diligence dual-truth (unsynchronized) =================
  console.log("\n[OWN-2] Pipeline stage and Diligence truth are two unsynchronized systems:");
  const p1 = await createPropertyRecord(org.id, propInput("Deal OWN2"), {});
  const opp1 = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: p1.id, title: "Deal OWN2", stage: OpportunityStage.LEAD } });
  await ensureOpportunityDiligence(org.id, opp1.id);

  // (a) advance stage to T12_RECEIVED without the t12 diligence item being received
  await prisma.opportunity.update({ where: { id: opp1.id }, data: { stage: OpportunityStage.T12_RECEIVED } });
  const t12a = await prisma.opportunityDiligenceItem.findFirst({ where: { opportunityId: opp1.id, key: "t12" } });
  confirm(t12a && t12a.status !== OpportunityDiligenceStatus.RECEIVED && t12a.status !== OpportunityDiligenceStatus.REVIEWED,
    `stage=T12_RECEIVED while the t12 diligence item is '${t12a?.status}' (stage asserts a fact the truth object denies)`);

  // (b) mark diligence received but leave stage behind
  const p2 = await createPropertyRecord(org.id, propInput("Deal OWN2b"), {});
  const opp2 = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: p2.id, title: "Deal OWN2b", stage: OpportunityStage.LEAD } });
  await ensureOpportunityDiligence(org.id, opp2.id);
  await prisma.opportunityDiligenceItem.updateMany({ where: { opportunityId: opp2.id, key: { in: ["t12", "rent_roll"] } }, data: { status: OpportunityDiligenceStatus.RECEIVED } });
  const opp2r = await prisma.opportunity.findUnique({ where: { id: opp2.id }, select: { stage: true } });
  confirm(opp2r.stage === OpportunityStage.LEAD,
    `t12 & rent_roll diligence RECEIVED while stage is still '${opp2r.stage}' (truth complete, stage lags — no sync either direction)`);

  // ================= OWN-3: PAID gate ignores funding / escrow / assignment terminality =====
  console.log("\n[OWN-3] The PAID gate validates the due-diligence checklist ONLY:");
  const p3 = await createPropertyRecord(org.id, propInput("Deal OWN3"), {});
  const opp3 = await prisma.opportunity.create({ data: { organizationId: org.id, propertyId: p3.id, title: "Deal OWN3", stage: OpportunityStage.CLOSING } });
  const checklist = await ensureClosingChecklist(org.id, opp3.id);
  const reqCount = checklist.items.filter((i) => i.required).length;
  // Satisfy every required checklist item (as a human operator would).
  await prisma.closingChecklistItem.updateMany({ where: { checklistId: checklist.id, required: true }, data: { status: "COMPLETE" } });

  const gate = await getClosingGateStatus(org.id, opp3.id);
  const [fin, esc, asg] = await Promise.all([
    prisma.financingRecord.findFirst({ where: { opportunityId: opp3.id } }),
    prisma.escrowRecord.findFirst({ where: { opportunityId: opp3.id } }),
    prisma.assignmentRecord.findFirst({ where: { opportunityId: opp3.id } }),
  ]);
  confirm(gate.ready === true, `PAID gate is READY after completing the ${reqCount} due-diligence items`);
  confirm(fin === null && esc === null && asg === null,
    `PAID is reachable with NO FinancingRecord / EscrowRecord / AssignmentRecord at all (funding/escrow/assignment truth is not required by the gate)`);
  const cats = [...new Set(checklist.items.map((i) => i.category))];
  confirm(!cats.some((c) => /FINANC|ESCROW|ASSIGN|FUND/i.test(c)),
    `default closing template has no funding/escrow/assignment item — categories = [${cats.join(", ")}]`);
} finally {
  console.log("\nCleaning up throwaway orgs...");
  for (const id of orgIds) await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  warn: ${e.message}`));
  await prisma.$disconnect();
}
console.log(`\n${fail.length === 0 ? "ALL INCONSISTENCIES REPRODUCED" : "SOME NOT REPRODUCED"} — ${ok} confirmed, ${fail.length} not`);
if (fail.length) process.exit(1);
