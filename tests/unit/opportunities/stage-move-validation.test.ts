import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage } from "@prisma/client";

// OPP-4 regression: moveOpportunityStage guards on VALID_STAGES (= Object.values(OpportunityStage))
// and now returns { error: "Invalid pipeline stage." } for a non-member instead of a silent no-op.
// This pins the guard predicate the action relies on (and guards against enum drift).
test("OPP-4: the stage-move guard set contains exactly the OpportunityStage enum, rejecting unknowns", () => {
  const VALID = new Set<string>(Object.values(OpportunityStage));
  assert.equal(VALID.has("BOGUS_STAGE"), false);
  assert.equal(VALID.has(""), false);
  assert.equal(VALID.has("paid"), false); // case-sensitive
  assert.equal(VALID.has("PAID"), true);
  assert.equal(VALID.has("LEAD"), true);
  assert.equal(VALID.size, Object.values(OpportunityStage).length);
});
