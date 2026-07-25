import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeDraftText } from "../../../lib/ai/draft-insert";

test("replaces when the field is empty", () => {
  assert.equal(mergeDraftText("", "Hello there."), "Hello there.");
  assert.equal(mergeDraftText("   \n ", "Hi."), "Hi."); // whitespace-only counts as empty
});

test("appends after a blank line when the field has content", () => {
  assert.equal(mergeDraftText("Existing draft.", "Added."), "Existing draft.\n\nAdded.");
});
