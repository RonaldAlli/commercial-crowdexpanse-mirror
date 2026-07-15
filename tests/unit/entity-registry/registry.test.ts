import { test } from "node:test";
import assert from "node:assert/strict";
import type { IntelligenceEntityType } from "@prisma/client";

import { ENTITY_PROJECTORS, getProjector, type EntityProjector } from "../../../lib/intelligence/entity-registry";
import { OWNER_PROJECTED_FIELDS } from "../../../lib/intelligence/owner-fields";
import { PROPERTY_PROJECTED_FIELDS } from "../../../lib/intelligence/property-fields";

// The registry is a dispatch table. These tests pin its *contract* (not the
// DB-touching hooks, which are exercised end-to-end by the e2e-refresh scripts):
// every registered type resolves to a projector, unregistered types resolve to
// null, and the field predicate delegates to the entity's own field set.

test("registry registers exactly the current entity types", () => {
  assert.deepEqual(Object.keys(ENTITY_PROJECTORS).sort(), ["OWNER", "PROPERTY"]);
});

test("getProjector returns the projector for each registered type", () => {
  assert.ok(getProjector("OWNER"), "OWNER projector is registered");
  assert.ok(getProjector("PROPERTY"), "PROPERTY projector is registered");
});

test("getProjector returns null for an unregistered type", () => {
  // Cast simulates a future enum member with no registered projector — the
  // defensive `?? null` branch the compiler otherwise makes unreachable today.
  assert.equal(getProjector("MARKET" as unknown as IntelligenceEntityType), null);
});

test("isProjectedField delegates to each entity's own projected-field set", () => {
  const owner = getProjector("OWNER") as EntityProjector;
  for (const f of OWNER_PROJECTED_FIELDS) assert.equal(owner.isProjectedField(f), true);
  assert.equal(owner.isProjectedField("squareFeet"), false); // a Property field is not an Owner field

  const property = getProjector("PROPERTY") as EntityProjector;
  for (const f of PROPERTY_PROJECTED_FIELDS) assert.equal(property.isProjectedField(f), true);
  assert.equal(property.isProjectedField("displayName"), false); // an Owner field is not a Property field
});
