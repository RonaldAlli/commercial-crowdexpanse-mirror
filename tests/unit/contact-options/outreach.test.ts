import { test } from "node:test";
import assert from "node:assert/strict";

import { OUTREACH_STATUS_OPTIONS, isOutreachStatus, outreachStatusLabel } from "../../../lib/contact-options";

test("isOutreachStatus gates setSellerOutreachStatus: valid enum true, junk false", () => {
  assert.ok(isOutreachStatus("QUALIFIED"));
  assert.ok(isOutreachStatus("NEW"));
  assert.ok(!isOutreachStatus(""));
  assert.ok(!isOutreachStatus("BOGUS"));
  assert.ok(!isOutreachStatus("qualified")); // enum is case-sensitive
});

test("OUTREACH_STATUS_OPTIONS covers all 7 statuses and includes QUALIFIED (the promote gate)", () => {
  assert.equal(OUTREACH_STATUS_OPTIONS.length, 7);
  assert.ok(OUTREACH_STATUS_OPTIONS.includes("QUALIFIED"));
});

test("outreachStatusLabel is human-readable", () => {
  assert.equal(outreachStatusLabel("QUALIFIED"), "Qualified");
  assert.equal(outreachStatusLabel("DO_NOT_CONTACT"), "Do not contact");
});
