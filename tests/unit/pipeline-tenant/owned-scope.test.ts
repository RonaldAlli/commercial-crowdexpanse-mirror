import { test } from "node:test";
import assert from "node:assert/strict";

import { ownedScopeFrom } from "../../../lib/pipeline-tenant";

// The pure core of the session-authoritative tenant rule. Its signature takes ONLY the
// session organization + the opportunity id + whether it was found in that org — there
// is deliberately no parameter through which a request-supplied org could enter.

test("AC-PIPE-AUTHZ-2 · resolved org is ALWAYS the session org, verbatim", () => {
  for (const org of ["orgA", "orgB", "cmr_xyz"]) {
    const scope = ownedScopeFrom(org, "opp1", true);
    assert.equal(scope?.organizationId, org);
  }
});

test("owned opportunity → scope with the session org + opportunity id", () => {
  assert.deepEqual(ownedScopeFrom("orgA", "opp1", true), { organizationId: "orgA", opportunityId: "opp1" });
});

test("AC-PIPE-AUTHZ-3 · unowned (cross-tenant / unknown) opportunity → null", () => {
  assert.equal(ownedScopeFrom("orgA", "opp1", false), null);
});

test("ownership is the only thing that gates scope — org identity never does", () => {
  // Same org, different ownership outcomes → the boolean alone decides.
  assert.notEqual(ownedScopeFrom("orgA", "oppZ", true), null);
  assert.equal(ownedScopeFrom("orgA", "oppZ", false), null);
});
