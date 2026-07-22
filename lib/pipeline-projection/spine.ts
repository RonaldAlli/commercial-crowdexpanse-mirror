// E4 · Projection: the versioned StageSpine. Each stage binds to its ONE Decision Fact type (OWN-4 / OWN4-INV-1) —
// NOT to an evaluator predicate. Projection observes these facts; the evaluator is never involved in stage.

import type { StageSpine } from "./types";

export const SS1: StageSpine = {
  spineId: "ss-1",
  spineVersion: "ss-1",
  entries: [
    { stage: "LEAD", decisionFactType: null }, // base
    { stage: "UNDERWRITTEN", decisionFactType: "UNDERWRITING_APPROVED" },
    { stage: "BUYER_MATCHED", decisionFactType: "BUYER_MATCHED" },
    { stage: "LOI_ACCEPTED", decisionFactType: "LOI_ACCEPTED" },
    { stage: "UNDER_CONTRACT", decisionFactType: "CONTRACT_EXECUTED" },
    { stage: "CLEAR_TO_CLOSE", decisionFactType: "CLEAR_TO_CLOSE" },
    { stage: "PAID", decisionFactType: "TRANSACTION_CLOSED" },
  ],
};

export function getStageSpine(spineId = "ss-1"): StageSpine | undefined {
  return spineId === "ss-1" ? SS1 : undefined;
}
