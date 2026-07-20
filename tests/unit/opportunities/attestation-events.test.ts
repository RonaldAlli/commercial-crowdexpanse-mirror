import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage } from "@prisma/client";

import { buildStageAttestationEvent, buildAttestationEvent, type AttestationKind } from "../../../lib/attestation-events";

test("buildStageAttestationEvent produces a consistent typed payload", () => {
  const e = buildStageAttestationEvent({
    stage: OpportunityStage.T12_RECEIVED,
    stageLabel: "T-12 Received",
    policyId: "t12-received",
    reason: "imported deal",
    source: "ui",
    missingTruth: ["T-12 diligence not received"],
    missingArtifacts: ["diligence item 't12' = RECEIVED"],
  });
  assert.equal(e.eventType, "opportunity.stage_attested");
  assert.match(e.eventLabel, /Attested T-12 Received without/);
  const body = JSON.parse(e.eventBody);
  assert.equal(body.kind, "stage");
  assert.equal(body.policyId, "t12-received");
  assert.equal(body.stage, "T12_RECEIVED");
  assert.equal(body.reason, "imported deal");
  assert.equal(body.source, "ui");
  assert.deepEqual(body.missingTruth, ["T-12 diligence not received"]);
  assert.deepEqual(body.missingArtifacts, ["diligence item 't12' = RECEIVED"]);
});

test("buildAttestationEvent supports every future attestation kind consistently", () => {
  for (const kind of ["buyer", "diligence", "closing", "assignment"] as AttestationKind[]) {
    const e = buildAttestationEvent({ kind, policyId: "p", reason: "r", source: "import", missingTruth: [], missingArtifacts: [], label: "L", detail: { extra: 1 } });
    assert.equal(e.eventType, `opportunity.${kind}_attested`);
    const body = JSON.parse(e.eventBody);
    assert.equal(body.kind, kind);
    assert.equal(body.source, "import");
    assert.equal(body.extra, 1); // detail is merged
  }
});
