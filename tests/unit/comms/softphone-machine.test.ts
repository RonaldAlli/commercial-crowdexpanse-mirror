import { test } from "node:test";
import assert from "node:assert/strict";

import { softphoneReducer, initialSoftphoneState } from "../../../lib/comms/softphone-machine";

const run = (events: Parameters<typeof softphoneReducer>[1][], start = initialSoftphoneState) =>
  events.reduce((s, e) => softphoneReducer(s, e), start);

test("dial-pad edits only while idle", () => {
  const s = run([{ type: "PRESS_DIGIT", digit: "4" }, { type: "PRESS_DIGIT", digit: "0" }]);
  assert.equal(s.digits, "40");
  const active = run([{ type: "SET_DIGITS", digits: "404" }, { type: "DIAL" }, { type: "MIC_GRANTED" }, { type: "ANSWERED" }, { type: "PRESS_DIGIT", digit: "9" }]);
  assert.equal(active.digits, "404"); // ignored during a call
});

test("DIAL requires a number; happy path idle→acquiring_mic→connecting→ringing→active", () => {
  assert.equal(softphoneReducer(initialSoftphoneState, { type: "DIAL" }).status, "idle"); // no digits → no-op
  const s = run([{ type: "SET_DIGITS", digits: "404" }, { type: "DIAL" }, { type: "MIC_GRANTED" }, { type: "REMOTE_RINGING" }, { type: "ANSWERED" }]);
  assert.equal(s.status, "active");
  assert.equal(s.seconds, 0);
});

test("NOT_CONFIGURED → error with the standard message (no crash)", () => {
  const s = run([{ type: "SET_DIGITS", digits: "404" }, { type: "DIAL" }, { type: "MIC_GRANTED" }, { type: "NOT_CONFIGURED" }]);
  assert.equal(s.status, "error");
  assert.equal(s.errorReason, "Voice provider not configured");
});

test("mic denial surfaces a clear error", () => {
  const s = run([{ type: "SET_DIGITS", digits: "404" }, { type: "DIAL" }, { type: "MIC_DENIED" }]);
  assert.equal(s.status, "error");
  assert.equal(s.errorReason, "Microphone permission denied");
});

test("timer advances only while active and not on hold", () => {
  const active = run([{ type: "SET_DIGITS", digits: "1" }, { type: "DIAL" }, { type: "MIC_GRANTED" }, { type: "ANSWERED" }]);
  assert.equal(softphoneReducer(active, { type: "TICK" }).seconds, 1);
  const held = softphoneReducer(active, { type: "TOGGLE_HOLD" });
  assert.equal(softphoneReducer(held, { type: "TICK" }).seconds, 0); // paused on hold
  assert.equal(softphoneReducer(initialSoftphoneState, { type: "TICK" }).seconds, 0); // idle: no tick
});

test("mute/hold only during an active call; hangup ends an in-progress call", () => {
  assert.equal(softphoneReducer(initialSoftphoneState, { type: "TOGGLE_MUTE" }).muted, false);
  const active = run([{ type: "SET_DIGITS", digits: "1" }, { type: "DIAL" }, { type: "MIC_GRANTED" }, { type: "ANSWERED" }]);
  assert.equal(softphoneReducer(active, { type: "TOGGLE_MUTE" }).muted, true);
  assert.equal(softphoneReducer(active, { type: "HANGUP" }).status, "ended");
});

test("RESET returns to idle but keeps the dialed number", () => {
  const active = run([{ type: "SET_DIGITS", digits: "404555" }, { type: "DIAL" }, { type: "MIC_GRANTED" }]);
  const reset = softphoneReducer(active, { type: "RESET" });
  assert.equal(reset.status, "idle");
  assert.equal(reset.digits, "404555");
});
