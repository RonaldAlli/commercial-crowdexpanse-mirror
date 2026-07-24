import { test } from "node:test";
import assert from "node:assert/strict";

import { buildUnifiedHistory, resolveChannelStatus } from "../../../lib/comms/conversation-view";

const msg = (id: string, ms: number, channel: "SMS" | "EMAIL" | "WHATSAPP" = "SMS") => ({
  id, channel, direction: "OUTBOUND" as const, body: id, subject: null, status: "SENT", createdAt: new Date(ms),
});
const call = (id: string, ms: number) => ({ id, direction: "OUTBOUND" as const, status: "COMPLETED", durationSec: 10, disposition: null, createdAt: new Date(ms) });

test("buildUnifiedHistory merges messages + calls, oldest first", () => {
  const h = buildUnifiedHistory([msg("m1", 100), msg("m2", 300)], [call("c1", 200)]);
  assert.deepEqual(h.map((i) => (i.kind === "message" ? i.message.id : i.call.id)), ["m1", "c1", "m2"]);
});

test("empty inputs → empty history", () => {
  assert.equal(buildUnifiedHistory([], []).length, 0);
});

test("resolveChannelStatus: null/disabled → not configured", () => {
  assert.equal(resolveChannelStatus(null, "SMS").configured, false);
  assert.equal(resolveChannelStatus({ smsEnabled: false, emailEnabled: true, whatsappEnabled: true, hasApiKey: true, hasMessagingProfile: true, hasFromNumber: true }, "SMS").configured, false);
});

test("SMS/WhatsApp require enable + api key + messaging profile + from number", () => {
  const cfg = { smsEnabled: true, emailEnabled: false, whatsappEnabled: true, hasApiKey: true, hasMessagingProfile: true, hasFromNumber: true };
  assert.equal(resolveChannelStatus(cfg, "SMS").configured, true);
  assert.equal(resolveChannelStatus(cfg, "WHATSAPP").configured, true);
  assert.equal(resolveChannelStatus({ ...cfg, hasFromNumber: false }, "SMS").configured, false);
  assert.equal(resolveChannelStatus({ ...cfg, hasMessagingProfile: false }, "WHATSAPP").configured, false);
});

test("Email is configured when enabled (uses the separate email provider abstraction)", () => {
  assert.equal(resolveChannelStatus({ smsEnabled: false, emailEnabled: true, whatsappEnabled: false, hasApiKey: false, hasMessagingProfile: false, hasFromNumber: false }, "EMAIL").configured, true);
  assert.equal(resolveChannelStatus({ smsEnabled: false, emailEnabled: false, whatsappEnabled: false, hasApiKey: false, hasMessagingProfile: false, hasFromNumber: false }, "EMAIL").configured, false);
});
