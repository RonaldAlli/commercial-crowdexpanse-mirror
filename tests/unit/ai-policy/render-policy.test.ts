import { test } from "node:test";
import assert from "node:assert/strict";

import type { ContactOutreachStatus } from "@prisma/client";

import { applyRule, PILOT_AI_POLICY, MASK, type AiDataPolicy } from "../../../lib/ai/context/policy";
import { renderSeller, renderTimeline, renderCommunications } from "../../../lib/ai/context/render";

test("applyRule: allow keeps, mask redacts present values, exclude drops", () => {
  assert.equal(applyRule("allow", "x"), "x");
  assert.equal(applyRule("allow", null), null);
  assert.equal(applyRule("mask", "x"), MASK);
  assert.equal(applyRule("mask", null), null); // absent stays absent, not "[redacted]"
  assert.equal(applyRule("exclude", "x"), null);
});

const seller = {
  id: "s1",
  name: "Jane Doe",
  company: null,
  phone: "555-100-2000",
  email: "jane@example.com",
  city: null,
  state: null,
  motivation: null,
  acquisitionChannel: null,
  outreachStatus: "NEW",
  doNotCall: false,
  doNotText: false,
  doNotEmail: false,
  ownerName: "Jane Doe (owner)",
};

test("pilot policy: phone + email masked; owner name allowed; raw values never appear", () => {
  const f = renderSeller(seller); // default = PILOT_AI_POLICY
  assert.match(f.text, /Phone: \[redacted\]/);
  assert.match(f.text, /Email: \[redacted\]/);
  assert.match(f.text, /Owner of record: Jane Doe \(owner\)/); // owner allowed for the pilot
  assert.ok(!f.text.includes("555-100-2000"), "raw phone must not appear");
  assert.ok(!f.text.includes("jane@example.com"), "raw email must not appear");
});

test("exclude removes the field entirely (owner + phone), email still masked", () => {
  const policy: AiDataPolicy = { ...PILOT_AI_POLICY, ownerName: "exclude", phone: "exclude" };
  const f = renderSeller(seller, policy);
  assert.ok(!f.text.includes("Owner of record"), "excluded owner line is gone");
  assert.ok(!/Phone:/.test(f.text), "excluded phone field is gone");
  assert.match(f.text, /Email: \[redacted\]/);
});

test("pilot policy: internal notes excluded from the timeline; message bodies allowed", () => {
  const f = renderTimeline({
    calls: [],
    messages: [{ at: 2, channel: "SMS", direction: "INBOUND", status: "DELIVERED", body: "please call me back", subject: null }],
    touches: [{ at: 1, touchType: "NOTE", summary: "SENSITIVE internal note text", actor: null }],
    statusEvents: [],
  });
  assert.ok(f);
  assert.ok(!f!.text.includes("SENSITIVE internal note text"), "internal note content excluded");
  assert.match(f!.text, /NOTE/); // the event is kept, only the free-form content dropped
  assert.match(f!.text, /SMS INBOUND: please call me back/); // bodies allowed for the pilot
});

test("communications: body withheld when the policy excludes it", () => {
  const policy: AiDataPolicy = { ...PILOT_AI_POLICY, smsBodies: "exclude" };
  const f = renderCommunications(
    { lastMessage: { at: 1, channel: "SMS", direction: "OUTBOUND", body: "secret contents", subject: null }, lastCall: null },
    policy,
  );
  assert.ok(f);
  assert.ok(!f!.text.includes("secret contents"));
  assert.match(f!.text, /content withheld/);
});

// Guard against silently sending outreach status as a raw enum where callers pass
// the branded type (compile-time coverage that renderSeller accepts it).
test("renderSeller accepts a ContactOutreachStatus-typed status", () => {
  const f = renderSeller({ ...seller, outreachStatus: "NEW" as ContactOutreachStatus });
  assert.equal(f.key, "seller");
});
