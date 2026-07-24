import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveVoiceStatus, inertVoiceAdapter } from "../../../lib/comms/voice-provider";

test("no config / voice disabled → not configured", () => {
  assert.equal(resolveVoiceStatus(null).configured, false);
  assert.equal(resolveVoiceStatus({ voiceEnabled: false, hasApiKey: true, hasConnectionId: true }).configured, false);
});

test("voice enabled but missing credentials → not configured", () => {
  assert.equal(resolveVoiceStatus({ voiceEnabled: true, hasApiKey: false, hasConnectionId: true }).configured, false);
  assert.equal(resolveVoiceStatus({ voiceEnabled: true, hasApiKey: true, hasConnectionId: false }).configured, false);
});

test("enabled + api key + connection id → configured", () => {
  const s = resolveVoiceStatus({ voiceEnabled: true, hasApiKey: true, hasConnectionId: true });
  assert.equal(s.configured, true);
  assert.equal(s.reason, null);
});

test("the inert adapter never claims to be configured and issues no token", async () => {
  const t = await inertVoiceAdapter.issueToken();
  assert.equal(t.configured, false);
  assert.equal(t.token, undefined);
});
