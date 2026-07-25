import { test } from "node:test";
import assert from "node:assert/strict";

import type { ContextFragment, ContextProvider, ProviderCtx } from "../../../lib/ai/context/types";
import { retrieve, CopilotNotFoundError } from "../../../lib/ai/brain/retrieve";

// Fake providers so retrieval logic is tested without touching the database.
function frag(key: string): ContextFragment {
  return { key, label: key, text: `${key} text`, sourceRefs: [] };
}
function provider(key: string, result: ContextFragment | null): ContextProvider {
  return { key, load: async () => result };
}

const ctx = { user: { organizationId: "org1" }, subjectId: "s1" } as unknown as ProviderCtx;

test("throws CopilotNotFoundError when the seller anchor is null (cross-org / missing)", async () => {
  const providers = [provider("seller", null), provider("timeline", frag("timeline"))];
  await assert.rejects(() => retrieve(["seller", "timeline"], ctx, providers), CopilotNotFoundError);
});

test("drops null (empty) fragments and returns the rest when the seller anchor is present", async () => {
  const providers = [
    provider("seller", frag("seller")),
    provider("timeline", null), // no activity yet — dropped
    provider("scoring", frag("scoring")),
  ];
  const out = await retrieve(["seller", "timeline", "scoring"], ctx, providers);
  assert.deepEqual(out.map((f) => f.key), ["seller", "scoring"]);
});

test("loads providers concurrently and preserves their given order", async () => {
  const providers = [provider("seller", frag("seller")), provider("property", frag("property"))];
  const out = await retrieve(["seller", "property"], ctx, providers);
  assert.deepEqual(out.map((f) => f.key), ["seller", "property"]);
});
