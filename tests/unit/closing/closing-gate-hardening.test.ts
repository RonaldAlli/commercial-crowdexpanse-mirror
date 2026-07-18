import { test } from "node:test";
import assert from "node:assert/strict";
import { OpportunityStage } from "@prisma/client";

import { isClosingReady, closingBlockMessage } from "../../../lib/closing";

// OPP-1 regression: the PAID gate must FAIL CLOSED on an empty or all-optional checklist. Before the
// fix, `[].every(...)` returned true, silently opening PAID on the absence of requirements.

test("OPP-1: empty checklist is NOT ready (fail closed)", () => {
  assert.equal(isClosingReady([]), false);
});

test("OPP-1: all-optional checklist is NOT ready, even if every optional item is COMPLETE", () => {
  assert.equal(isClosingReady([{ required: false, status: "PENDING" }]), false);
  assert.equal(isClosingReady([{ required: false, status: "COMPLETE" }]), false);
});

test("OPP-1: unchanged happy path — required items still gate normally", () => {
  assert.equal(isClosingReady([{ required: true, status: "PENDING" }]), false);
  assert.equal(isClosingReady([{ required: true, status: "COMPLETE" }]), true);
  assert.equal(isClosingReady([{ required: true, status: "WAIVED" }, { required: false, status: "PENDING" }]), true);
});

test("OPP-1: block message explains the misconfiguration for a no-required checklist", () => {
  assert.match(closingBlockMessage([]) ?? "", /no required items|configuration/i);
  assert.match(closingBlockMessage([{ required: false, status: "PENDING", label: "Optional" }]) ?? "", /configuration/i);
});

test("OPP-1: block message stays consistent with a valid, satisfied/outstanding checklist", () => {
  assert.equal(closingBlockMessage([{ required: true, status: "COMPLETE", label: "Title" }]), null); // ready → null
  assert.match(closingBlockMessage([{ required: true, status: "PENDING", label: "Title search" }]) ?? "", /Title search/);
});

// OPP-4 guard: the stage-move guard rejects any value that is not a real OpportunityStage. (The action
// now returns { error: "Invalid pipeline stage." } for these instead of a silent no-op.)
test("OPP-4: unknown stage strings are not valid OpportunityStage values", () => {
  const VALID = new Set<string>(Object.values(OpportunityStage));
  assert.equal(VALID.has("BOGUS_STAGE"), false);
  assert.equal(VALID.has(""), false);
  assert.equal(VALID.has("PAID"), true);
});
