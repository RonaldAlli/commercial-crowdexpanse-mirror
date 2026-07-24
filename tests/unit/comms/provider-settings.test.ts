import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCommsSettingsForm, commsReadiness, blankToNull } from "../../../lib/comms/provider-settings";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

test("blankToNull trims and nulls empties", () => {
  assert.equal(blankToNull("  x "), "x");
  assert.equal(blankToNull("   "), null);
  assert.equal(blankToNull(null), null);
});

test("parse: valid input maps checkboxes and trims fields", () => {
  const r = parseCommsSettingsForm(form({
    fromNumber: "+14045551234",
    messagingProfileId: " mp_1 ",
    connectionId: "conn_1",
    apiKey: "KEY0123456789",
    smsEnabled: "on",
    voiceEnabled: "on",
  }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.fromNumber, "+14045551234");
  assert.equal(r.value.messagingProfileId, "mp_1");
  assert.equal(r.value.newApiKey, "KEY0123456789");
  assert.equal(r.value.smsEnabled, true);
  assert.equal(r.value.voiceEnabled, true);
  assert.equal(r.value.whatsappEnabled, false);
  assert.equal(r.value.emailEnabled, false);
});

test("parse: blank API key means keep-existing (null), not error", () => {
  const r = parseCommsSettingsForm(form({ fromNumber: "+14045551234" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.newApiKey, null);
});

test("parse: rejects non-E.164 from number", () => {
  const r = parseCommsSettingsForm(form({ fromNumber: "404-555-1234" }));
  assert.equal(r.ok, false);
});

test("parse: rejects too-short API key", () => {
  const r = parseCommsSettingsForm(form({ apiKey: "short" }));
  assert.equal(r.ok, false);
});

test("readiness: no encryption key ⇒ nothing testable regardless of config", () => {
  const cfg = { smsEnabled: true, emailEnabled: false, whatsappEnabled: false, hasApiKey: true, hasMessagingProfile: true, hasFromNumber: true };
  const r = commsReadiness(cfg, { voiceEnabled: true, hasApiKey: true, hasConnectionId: true }, false);
  assert.equal(r.encryptionReady, false);
  assert.equal(r.canTest, false);
  assert.equal(r.channels.find((c) => c.key === "SMS")?.status.configured, true);
});

test("readiness: canTest requires key + api key + configured voice", () => {
  const cfg = { smsEnabled: false, emailEnabled: false, whatsappEnabled: false, hasApiKey: true, hasMessagingProfile: false, hasFromNumber: false };
  const yes = commsReadiness(cfg, { voiceEnabled: true, hasApiKey: true, hasConnectionId: true }, true);
  assert.equal(yes.canTest, true);
  const noVoice = commsReadiness(cfg, { voiceEnabled: false, hasApiKey: true, hasConnectionId: true }, true);
  assert.equal(noVoice.canTest, false);
});
