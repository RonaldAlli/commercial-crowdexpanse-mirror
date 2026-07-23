// AC-VM-* · E7 UI view-model assembly acceptance suite (Phase 4).
// The acceptance boundary is the PURE assembly (frozen contracts → domain VMs → PipelineViewModel → render props),
// NOT React rendering. Verifies contract-embedding (UI-INV-2/5), determinism (UI-INV-4), stage/attention separation,
// and the projection-changes ⇒ VM-changes ⇒ renderer-unchanged property. Runs against the *_test DB.
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { recordFact } from "../lib/pipeline-facts/service.ts";
import { buildFactGraph } from "../lib/pipeline-facts/fact-graph.ts";
import { project } from "../lib/pipeline-projection/project.ts";
import { SS1 } from "../lib/pipeline-projection/spine.ts";
import { assemblePipeline, toRenderProps, assembleValidation, assembleAuthorizationPanel } from "../lib/pipeline-view-models/assemble.ts";

const TAG = "e2e-vm";
const ORG = `${TAG}-${process.pid}`;
const VC = { policyVersion: "p1", ruleSetVersion: "rs-1" };
const PP = { projectionVersion: "pp-1" };
assertTestDatabase();
let ok = 0;
const fail = [];
const assert = (c, m) => { if (c) { ok++; console.log(`  ✓ ${m}`); } else { fail.push(m); console.log(`  ✗ ${m}`); } };
const newOpp = () => `opp-${randomUUID()}`;
const declare = (opp, factType) => recordFact({ organizationId: ORG, opportunityId: opp, factType, operation: "DECLARE", actorType: "HUMAN" });
const pvmOf = async (opp) => {
  const graph = await buildFactGraph({ organizationId: ORG, opportunityId: opp, versionContext: VC });
  const projection = project({ spine: SS1, graph, projectionPolicy: PP });
  return { projection, pvm: assemblePipeline({ opportunityId: opp, projection, orderedFacts: [...graph.history], activeIds: new Set(graph.activeFacts.map((f) => f.id)) }) };
};

try {
  console.log("\n[1] AC-VM · domain VM embeds the ProjectionResult AS-IS (UI-INV-2/5):");
  const o1 = newOpp();
  const { projection: p1, pvm: vm1 } = await pvmOf(o1);
  assert(vm1.opportunity.projection === p1, "OpportunityViewModel embeds the SAME ProjectionResult object (no copy/reinterpretation)");
  assert(vm1.opportunity.stage === p1.stage && vm1.opportunity.completeness === p1.completeness, "stage + completeness taken directly from the contract");

  console.log("\n[2] AC-VM · stage vs activity separation preserved (PR-INV-8 into the UI):");
  assert(JSON.stringify(vm1.activity.indicators) === JSON.stringify(p1.indicators), "activity indicators = projection indicators (attention), independent of stage");

  console.log("\n[3] AC-VM · determinism (UI-INV-4) — same input ⇒ same view model:");
  const again = (await pvmOf(o1)).pvm;
  assert(JSON.stringify(again) === JSON.stringify(vm1), "assemblePipeline(X) == assemblePipeline(X)");

  console.log("\n[4] AC-VM · projection changes ⇒ VM changes ⇒ renderer SHAPE unchanged:");
  const o2 = newOpp();
  await declare(o2, "UNDERWRITING_APPROVED"); // stage UNDERWRITTEN
  const { pvm: vm2 } = await pvmOf(o2);
  assert(vm1.opportunity.stage === "LEAD" && vm2.opportunity.stage === "UNDERWRITTEN", "different projections yield different view models (values differ)");
  const rp1 = toRenderProps(vm1);
  const rp2 = toRenderProps(vm2);
  assert(JSON.stringify(rp1.panels.map((p) => p.key)) === JSON.stringify(rp2.panels.map((p) => p.key)), "render-props SHAPE (panel keys) is IDENTICAL — the renderer is independent of business semantics");
  assert(rp1.headline.stage !== rp2.headline.stage, "only the VALUES differ (headline stage), not the structure");

  console.log("\n[5] AC-VM · timeline entries come from ordered facts + active set (UI never reconstructs):");
  assert(vm2.timeline.entries.length === 1 && vm2.timeline.entries[0].factType === "UNDERWRITING_APPROVED" && vm2.timeline.entries[0].active === true, "timeline reflects the declared decision fact (active)");

  console.log("\n[6] AC-VM · validation presentation preserves the frozen ApiError fields (UI-INV-5):");
  const val = assembleValidation({ category: "concurrency", httpStatus: 409, subsystemCode: "STALE_FACT_GRAPH", contractVersions: {} });
  assert(val.present && val.category === "concurrency" && val.httpStatus === 409 && val.subsystemCode === "STALE_FACT_GRAPH", "ApiError → ValidationPresentation with category/httpStatus/subsystemCode preserved (no new code invented)");
  assert(!assembleValidation(undefined).present, "no error ⇒ validation panel absent");

  console.log("\n[7] AC-VM · authorization panel embeds the AuthorizationDecision AS-IS:");
  const decision = { decision: { allow: false, denyCodes: ["INSUFFICIENT_CAPABILITY"], actor: {}, capability: "DECLARE_X", operation: {}, decisionId: "d1", policyVersion: "ap-1" }, explanation: { evaluationArtifact: null, policyReasons: [], authorizationReasoning: [] } };
  const auth = assembleAuthorizationPanel(decision);
  assert(auth.present && auth.allow === false && auth.denyCodes[0] === "INSUFFICIENT_CAPABILITY" && auth.decision === decision, "AuthorizationDecision embedded AS-IS (allow + denyCodes surfaced)");

  console.log("\n[8] AC-VM · navigation is presentation state (UI-INV-3):");
  assert(vm1.navigation.tabs.includes("Projection") && vm1.navigation.activeTab === "Projection", "navigation carries tabs + default activeTab (independent of business state)");
} finally {
  await prisma.pipelineFact.deleteMany({ where: { organizationId: ORG } }).catch(() => {});
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
