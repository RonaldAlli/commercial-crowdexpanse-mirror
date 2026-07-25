import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SHORTCUT_PROVIDERS,
  SHORTCUT_IDS,
  resolveIntent,
  isShortcutId,
} from "../../../lib/ai/brain/intent";

// PRODUCT BEHAVIOR: the shortcut → provider retrieval map. These assertions guard
// against accidental regressions when shortcuts are added or reordered.
const EXPECTED: Record<string, string[]> = {
  "summarize-seller": ["seller", "timeline"],
  "prepare-for-call": ["seller", "property", "session", "timeline", "scoring"],
  "draft-sms": ["seller", "communications"],
  "draft-email": ["seller", "communications", "timeline"],
  "write-opening": ["seller", "property", "scoring"],
  "handle-objection": ["seller", "timeline", "scoring"],
  "explain-motivation": ["seller", "timeline", "communications"],
  "recommend-next-step": ["seller", "session", "timeline", "scoring"],
  "generate-call-summary": ["seller", "timeline", "session", "communications"],
};

test("every shortcut maps to its exact provider set", () => {
  for (const id of SHORTCUT_IDS) {
    assert.deepEqual(SHORTCUT_PROVIDERS[id], EXPECTED[id], `mapping for ${id}`);
  }
  // no stray or missing shortcut ids
  assert.deepEqual([...SHORTCUT_IDS].sort(), Object.keys(EXPECTED).sort());
});

test("every shortcut retrieves the seller anchor", () => {
  for (const id of SHORTCUT_IDS) {
    assert.ok(SHORTCUT_PROVIDERS[id].includes("seller"), `${id} must include seller`);
  }
});

test("resolveIntent returns the shortcut mapping for a known shortcut", () => {
  const intent = resolveIntent({ shortcutId: "draft-sms", question: "" });
  assert.equal(intent.id, "draft-sms");
  assert.deepEqual(intent.providers, ["seller", "communications"]);
});

test("resolveIntent falls back to freeform for an unknown shortcut id", () => {
  const intent = resolveIntent({ shortcutId: "not-a-real-shortcut", question: "hello" });
  assert.equal(intent.id, "freeform");
  assert.ok(intent.providers.includes("seller"));
  assert.ok(intent.providers.includes("timeline"));
});

test("freeform keyword heuristics add providers over the safe default", () => {
  const sms = resolveIntent({ shortcutId: undefined, question: "draft an SMS for this seller" });
  assert.ok(sms.providers.includes("communications"));

  const lead = resolveIntent({ shortcutId: undefined, question: "why is this a good lead?" });
  assert.ok(lead.providers.includes("scoring"));

  const prop = resolveIntent({ shortcutId: undefined, question: "tell me about the property" });
  assert.ok(prop.providers.includes("property"));

  const bare = resolveIntent({ shortcutId: undefined, question: "hello" });
  assert.deepEqual(bare.providers.sort(), ["seller", "timeline"]);
});

test("isShortcutId gates known ids", () => {
  assert.ok(isShortcutId("prepare-for-call"));
  assert.ok(!isShortcutId("prepare"));
  assert.ok(!isShortcutId(""));
});
