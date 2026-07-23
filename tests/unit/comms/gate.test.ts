import { test } from "node:test";
import assert from "node:assert/strict";

import { commsGate } from "../../../lib/comms/gate";

const base = {
  outreachStatus: "NEW",
  doNotCall: false,
  doNotText: false,
  doNotEmail: false,
  badPhone: false,
  badEmail: false,
  phone: "(404) 555-0100",
  email: "a@b.com",
};

test("DO_NOT_CONTACT blocks every channel", () => {
  const f = { ...base, outreachStatus: "DO_NOT_CONTACT" };
  for (const ch of ["PHONE", "SMS", "WHATSAPP", "EMAIL"] as const) {
    assert.equal(commsGate(f, ch).allowed, false, ch);
  }
});

test("PHONE: do-not-call, bad phone, or missing phone each block; else allowed", () => {
  assert.equal(commsGate(base, "PHONE").allowed, true);
  assert.equal(commsGate({ ...base, doNotCall: true }, "PHONE").allowed, false);
  assert.equal(commsGate({ ...base, badPhone: true }, "PHONE").allowed, false);
  assert.equal(commsGate({ ...base, phone: null }, "PHONE").allowed, false);
});

test("SMS/WhatsApp gated by do-not-text + phone validity", () => {
  assert.equal(commsGate(base, "SMS").allowed, true);
  assert.equal(commsGate({ ...base, doNotText: true }, "SMS").allowed, false);
  assert.equal(commsGate({ ...base, doNotText: true }, "WHATSAPP").allowed, false);
  assert.equal(commsGate({ ...base, phone: null }, "SMS").allowed, false);
});

test("EMAIL gated by do-not-email + email validity (phone flags don't block email)", () => {
  assert.equal(commsGate(base, "EMAIL").allowed, true);
  assert.equal(commsGate({ ...base, doNotEmail: true }, "EMAIL").allowed, false);
  assert.equal(commsGate({ ...base, badEmail: true }, "EMAIL").allowed, false);
  assert.equal(commsGate({ ...base, email: null }, "EMAIL").allowed, false);
  assert.equal(commsGate({ ...base, doNotCall: true, badPhone: true }, "EMAIL").allowed, true);
});
