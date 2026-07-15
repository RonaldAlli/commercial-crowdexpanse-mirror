import { test } from "node:test";
import assert from "node:assert/strict";
import type { IntelligenceEntityType } from "@prisma/client";

import { ENTITY_PROJECTORS, getProjector, type EntityProjector } from "../../../lib/intelligence/entity-registry";
import { OWNER_PROJECTED_FIELDS } from "../../../lib/intelligence/owner-fields";

// The registry is a dispatch table. These tests pin its *contract* (not the
// DB-touching hooks, which are exercised end-to-end by scripts/e2e-refresh.mjs):
// every registered type resolves to a projector, unregistered types resolve to
// null, and the field predicate delegates to the entity's own field set.

test("registry registers exactly the current entity types", () => {
  assert.deepEqual(Object.keys(ENTITY_PROJECTORS).sort(), ["OWNER"]);
});

test("getProjector returns the projector for a registered type", () => {
  assert.ok(getProjector("OWNER"), "OWNER projector is registered");
});

test("getProjector returns null for an unregistered type", () => {
  // Cast simulates a future enum member with no registered projector — the
  // defensive `?? null` branch the compiler otherwise makes unreachable today.
  assert.equal(getProjector("MARKET" as unknown as IntelligenceEntityType), null);
});

test("OWNER.isProjectedField delegates to the owner projected-field set", () => {
  const owner = getProjector("OWNER") as EntityProjector;
  for (const f of OWNER_PROJECTED_FIELDS) assert.equal(owner.isProjectedField(f), true);
  assert.equal(owner.isProjectedField("not-a-projected-field"), false);
});
