import { test } from "node:test";
import assert from "node:assert/strict";

import { ACQUISITION_PROVIDERS, providersByKeys } from "../../../lib/ai/context/registry";

test("registry exposes the six acquisition providers in order", () => {
  assert.deepEqual(
    ACQUISITION_PROVIDERS.map((p) => p.key),
    ["seller", "property", "session", "timeline", "communications", "scoring"],
  );
  // every provider exposes a load() function
  for (const p of ACQUISITION_PROVIDERS) {
    assert.equal(typeof p.load, "function");
  }
});

test("providersByKeys selects a subset in registry order, dedupes, ignores unknown keys", () => {
  const selected = providersByKeys(["timeline", "seller", "seller", "does-not-exist"]);
  assert.deepEqual(
    selected.map((p) => p.key),
    ["seller", "timeline"], // registry order, deduped, unknown dropped
  );
});

test("providersByKeys returns empty for no/all-unknown keys", () => {
  assert.deepEqual(providersByKeys([]), []);
  assert.deepEqual(providersByKeys(["nope", "nada"]), []);
});
