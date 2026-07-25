import { test } from "node:test";
import assert from "node:assert/strict";

import { COPILOT_SHORTCUTS, SHORTCUT_IDS } from "../../../lib/ai/shortcuts";
import { SHORTCUT_PROVIDERS, SHORTCUT_IDS as BRAIN_SHORTCUT_IDS } from "../../../lib/ai/brain/intent";

test("every shortcut is a well-formed product record (id, label, prompt, providers)", () => {
  for (const s of COPILOT_SHORTCUTS) {
    assert.ok(typeof s.id === "string" && s.id.length > 0, "id");
    assert.ok(s.label.trim().length > 0, `${s.id} label`);
    assert.ok(s.prompt.trim().length > 0, `${s.id} prompt`);
    assert.ok(Array.isArray(s.providers) && s.providers.length > 0, `${s.id} providers`);
    assert.ok(s.providers.includes("seller"), `${s.id} includes the seller anchor`);
  }
});

test("shortcut ids are unique and match SHORTCUT_IDS", () => {
  const ids = COPILOT_SHORTCUTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  assert.deepEqual([...ids].sort(), [...SHORTCUT_IDS].sort());
});

test("catalog is the single source of truth — the Brain derives ids + providers from it", () => {
  assert.deepEqual([...BRAIN_SHORTCUT_IDS].sort(), [...SHORTCUT_IDS].sort());
  for (const s of COPILOT_SHORTCUTS) {
    assert.deepEqual(SHORTCUT_PROVIDERS[s.id], s.providers, `providers for ${s.id}`);
  }
});
