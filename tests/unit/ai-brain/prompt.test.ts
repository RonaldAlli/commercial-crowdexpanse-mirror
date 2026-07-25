import { test } from "node:test";
import assert from "node:assert/strict";

import type { ContextFragment } from "../../../lib/ai/context/types";
import { buildSystemPrompt } from "../../../lib/ai/brain/prompt";
import { resolveIntent } from "../../../lib/ai/brain/intent";

const intent = resolveIntent({ shortcutId: "summarize-seller", question: "" });

function frag(key: string, label: string, text: string): ContextFragment {
  return { key, label, text, sourceRefs: [{ kind: "seller", anchor: key, snippet: text }] };
}

test("system prompt carries persona + read-only guardrail + citation instruction + labeled context", () => {
  const fragments = [
    frag("seller", "Seller", "Jane Doe · motivated"),
    frag("timeline", "Recent timeline", "Call (OUTBOUND, COMPLETED)"),
  ];
  const { system, sources } = buildSystemPrompt("acquisition", intent, fragments);

  assert.match(system, /Acquisition Copilot/); // persona
  assert.match(system, /READ-ONLY/); // guardrail
  assert.match(system, /cannot .*send SMS or email/i);
  assert.match(system, /\[S1\], \[S2\]/); // citation instruction lists labels
  assert.match(system, /\[S1\] Seller:/); // labeled context block
  assert.match(system, /\[S2\] Recent timeline:/);
  assert.match(system, /Jane Doe · motivated/);

  assert.deepEqual(
    sources.map((s) => [s.label, s.key, s.providerLabel]),
    [
      ["S1", "seller", "Seller"],
      ["S2", "timeline", "Recent timeline"],
    ],
  );
});

test("empty fragments render an explicit no-context marker; sources is empty", () => {
  const { system, sources } = buildSystemPrompt("acquisition", intent, []);
  assert.match(system, /no workspace context available/i);
  assert.equal(sources.length, 0);
});

test("unknown consumer has no persona and is rejected", () => {
  assert.throws(() => buildSystemPrompt("not-a-consumer", intent, []), /No persona registered/);
});
