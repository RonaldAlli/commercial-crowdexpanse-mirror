import { test } from "node:test";
import assert from "node:assert/strict";

import { DISPOSITIONS, isDisposition, dispositionEffect } from "../../../lib/disposition";

test("six operator dispositions; isDisposition gates the recordDisposition action", () => {
  assert.equal(DISPOSITIONS.length, 6);
  assert.ok(isDisposition("Connected"));
  assert.ok(isDisposition("DNC"));
  assert.ok(!isDisposition(""));
  assert.ok(!isDisposition("Nope"));
});

test("DNC retires the lead (DO_NOT_CONTACT + doNotCall) — removes it from the call queue", () => {
  const e = dispositionEffect("DNC");
  assert.equal(e.outreachStatus, "DO_NOT_CONTACT");
  assert.equal(e.doNotCall, true);
});

test("Connected and Appointment set progress the lead to RESPONDED", () => {
  assert.equal(dispositionEffect("Connected").outreachStatus, "RESPONDED");
  assert.equal(dispositionEffect("Appointment set").outreachStatus, "RESPONDED");
});

test("Wrong number flags badPhone; No answer / Voicemail only log (no status change)", () => {
  assert.equal(dispositionEffect("Wrong number").badPhone, true);
  assert.equal(dispositionEffect("No answer").outreachStatus, undefined);
  assert.equal(dispositionEffect("Voicemail").outreachStatus, undefined);
});

test("every disposition produces a human summary", () => {
  for (const d of DISPOSITIONS) {
    assert.ok(dispositionEffect(d).summary.length > 0, d);
  }
});
