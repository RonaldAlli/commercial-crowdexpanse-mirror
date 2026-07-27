// BE-2 Step 1 — pure Deal rules (lib/deal.ts). No DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PipelineFactClass, PipelineFactOperation } from "@prisma/client";

import { selectControlFact, controlledAtOf, CONTROL_FACT_TYPE, BUSINESS_ARCHITECTURE_VERSION } from "../../../lib/deal";

const mk = (factType: string, factClass: PipelineFactClass, extra: Record<string, unknown> = {}) => ({
  factType,
  factClass,
  operation: PipelineFactOperation.DECLARE,
  id: "f",
  occurredAt: null as Date | null,
  recordedAt: new Date(0),
  ...extra,
});

test("selectControlFact picks the active CONTRACT_EXECUTED DECLARE decision", () => {
  const facts = [
    mk("UNDERWRITING_APPROVED", PipelineFactClass.DECISION),
    mk(CONTROL_FACT_TYPE, PipelineFactClass.DECISION, { id: "control" }),
  ];
  assert.equal(selectControlFact(facts)?.id, "control");
});

test("selectControlFact returns null without a control fact", () => {
  assert.equal(selectControlFact([mk("LOI_ACCEPTED", PipelineFactClass.DECISION)]), null);
});

test("selectControlFact ignores a non-DECISION with the control type (executed evidence ≠ control)", () => {
  assert.equal(selectControlFact([mk(CONTROL_FACT_TYPE, PipelineFactClass.EVIDENCE)]), null);
});

test("selectControlFact rejects an active RETRACT row (control withdrawn ≠ controlled)", () => {
  const retracted = mk(CONTROL_FACT_TYPE, PipelineFactClass.DECISION, { id: "r", operation: PipelineFactOperation.RETRACT });
  assert.equal(selectControlFact([retracted]), null);
});

test("controlledAtOf prefers occurredAt, falls back to recordedAt", () => {
  const occurred = new Date("2026-01-01T00:00:00Z");
  const recorded = new Date("2026-02-02T00:00:00Z");
  assert.equal(controlledAtOf({ occurredAt: occurred, recordedAt: recorded }).toISOString(), occurred.toISOString());
  assert.equal(controlledAtOf({ occurredAt: null, recordedAt: recorded }).toISOString(), recorded.toISOString());
});

test("baseline version is the ratified 1.0", () => {
  assert.equal(BUSINESS_ARCHITECTURE_VERSION, "1.0");
});
