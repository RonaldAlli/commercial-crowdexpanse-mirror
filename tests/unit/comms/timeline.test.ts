import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTimeline, type TimelineEntry } from "../../../lib/comms/timeline";

test("buildTimeline merges all sources into one stream, newest first", () => {
  const entries: TimelineEntry[] = [
    { kind: "touch", at: 100, touchType: "CALL", summary: "no answer", actor: "Rep" },
    { kind: "message", at: 300, channel: "SMS", direction: "INBOUND", status: "RECEIVED", body: "call me", subject: null },
    { kind: "call", at: 200, direction: "OUTBOUND", status: "COMPLETED", disposition: "Connected", durationSec: 90 },
    { kind: "status", at: 400, label: "Contacted → Qualified" },
  ];
  const t = buildTimeline(entries);
  assert.deepEqual(t.map((e) => e.at), [400, 300, 200, 100]);
  assert.deepEqual(t.map((e) => e.kind), ["status", "message", "call", "touch"]);
});

test("empty → empty; input is not mutated", () => {
  assert.equal(buildTimeline([]).length, 0);
  const input: TimelineEntry[] = [{ kind: "status", at: 1, label: "a" }, { kind: "status", at: 2, label: "b" }];
  const copy = [...input];
  buildTimeline(input);
  assert.deepEqual(input, copy);
});
