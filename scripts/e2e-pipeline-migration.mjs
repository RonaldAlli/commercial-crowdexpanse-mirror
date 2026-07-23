// AC-*-M* · E5 Migration acceptance suite (Phase 4).
// Verifies the three-outcome classification (MIG-INV-1), no-evidence-synthesis (MIG-INV-2), immutable/deterministic
// plans (MIG-INV-5), versioned-mapping reproducibility (MIG-INV-4), provenance attribution, idempotent execution,
// and the review register. Runs against the *_test DB. Migration reads source, writes only append-only facts.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { reconstructHistory } from "../lib/pipeline-facts/service.ts";
import { buildPlan } from "../lib/pipeline-migration/plan.ts";
import { executePlan } from "../lib/pipeline-migration/execute.ts";
import { getMapping } from "../lib/pipeline-migration/mapping.ts";

const TAG = "e2e-mig";
const ORG = `${TAG}-${process.pid}`;
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const CTX = { migrationBatchId: "batch-1", migrationSource: "legacy-crm-2019" };

try {
  const opp = newOpp();
  const source = [
    { sourceSystem: "crm", sourceObject: "deal", sourceRecordId: "D1", sourceField: "stage", value: "UNDER_CONTRACT", organizationId: ORG, opportunityId: opp },
    { sourceSystem: "crm", sourceObject: "deal", sourceRecordId: "D1", sourceField: "diligence", value: { material: "t12", verified: true }, organizationId: ORG, opportunityId: opp },
    { sourceSystem: "crm", sourceObject: "deal", sourceRecordId: "D2", sourceField: "diligence", value: { material: "rent_roll", verified: false }, organizationId: ORG, opportunityId: opp },
  ];

  console.log("\n[1] MIG-INV-1 · three-outcome classification (declared by policy):");
  const plan = buildPlan(source, getMapping("mapping-v1"));
  assert(plan.items[0].outcome === "MIGRATION_ORIGIN" && plan.items[0].target.factType === "CONTRACT_EXECUTED", "legacy UNDER_CONTRACT → MIGRATION_ORIGIN CONTRACT_EXECUTED (historical assertion)");
  assert(plan.items[1].outcome === "VERIFIED_FACT" && plan.items[1].target.factType === "DILIGENCE_MATERIAL_RECEIVED", "verified diligence → VERIFIED_FACT evidence");
  assert(plan.items[2].outcome === "REVIEW", "unverified diligence → REVIEW (never synthesized)");

  console.log("\n[2] Execution applies the plan; review goes to the queue not the ledger:");
  const res = await executePlan(plan, CTX);
  assert(res.recorded.length === 2 && res.review.length === 1, "2 facts recorded, 1 routed to review register");

  console.log("\n[3] Provenance attribution (MIGRATION_PRINCIPAL; MIGRATION_ORIGIN vs VERIFIED):");
  assert(res.recorded.some((r) => r.provenance === "MIGRATION_ORIGIN") && res.recorded.some((r) => r.provenance === "VERIFIED"), "one MIGRATION_ORIGIN + one VERIFIED fact");
  const hist = await reconstructHistory(ORG, opp);
  const ce = hist.find((f) => f.factType === "CONTRACT_EXECUTED");
  assert(ce.actorType === "MIGRATION_PRINCIPAL" && ce.provenance === "MIGRATION_ORIGIN" && ce.actorId === "legacy-crm-2019", "migrated decision: MIGRATION_PRINCIPAL + MIGRATION_ORIGIN + source attribution");

  console.log("\n[4] MIG-INV-2 · migration NEVER manufactures evidence (evidence-as-migration-origin rejected):");
  const badMapping = { mappingId: "bad", mappingVersion: "bad-v1", rules: [{ ruleId: "evil", match: (d) => d.sourceField === "ev", outcome: "MIGRATION_ORIGIN", buildTarget: () => ({ factType: "DILIGENCE_MATERIAL_RECEIVED", op: "RECORD_EVIDENCE", subjectKey: "x" }) }] };
  const badOpp = newOpp();
  const badPlan = buildPlan([{ sourceSystem: "crm", sourceObject: "deal", sourceRecordId: "E1", sourceField: "ev", value: "x", organizationId: ORG, opportunityId: badOpp }], badMapping);
  assert(badPlan.items[0].outcome === "REVIEW" && badPlan.items[0].planError === "EVIDENCE_MIGRATION_ORIGIN_FORBIDDEN", "an EVIDENCE-target MIGRATION_ORIGIN rule is rejected at plan time → REVIEW");
  const badRes = await executePlan(badPlan, CTX);
  assert(badRes.recorded.length === 0 && badRes.review.length === 1, "no evidence fact synthesized; it goes to review");

  console.log("\n[5] Idempotency · re-running the plan records nothing new:");
  const res2 = await executePlan(plan, { migrationBatchId: "batch-2", migrationSource: "legacy-crm-2019" });
  assert(res2.recorded.length === 0 && res2.skipped.length === 2, "re-run skips already-present source keys (idempotent)");
  assert((await reconstructHistory(ORG, opp)).filter((f) => f.factType === "CONTRACT_EXECUTED").length === 1, "no duplicate CONTRACT_EXECUTED fact");

  console.log("\n[6] MIG-INV-4/5 · versioned mappings + immutable, reproducible plans:");
  const v1a = buildPlan(source, getMapping("mapping-v1"));
  const v1b = buildPlan(source, getMapping("mapping-v1"));
  assert(v1a.planId === v1b.planId, "same source + same mappingVersion ⇒ identical planId (deterministic)");
  const v2 = buildPlan(source, getMapping("mapping-v2"));
  assert(v2.planId !== v1a.planId && v2.items[0].outcome === "REVIEW", "mapping-v2 yields a DIFFERENT plan (UNDER_CONTRACT → REVIEW); re-running v1 still reproduces Plan A");
  let frozen = false;
  try { v1a.items.push({}); } catch { frozen = true; }
  assert(frozen, "the plan is immutable (MIG-INV-5)");

  console.log("\n[7] MIG-INV-3 · observational — buildPlan never mutates the source:");
  const snap = JSON.stringify(source);
  buildPlan(source, getMapping("mapping-v1"));
  assert(JSON.stringify(source) === snap, "source data is unchanged after planning (read-only)");

  console.log("\n[8] Review register carries the reason + proposed fact type:");
  assert(res.review[0].reviewReason.includes("not independently verified"), "review item preserves the classification reason");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
