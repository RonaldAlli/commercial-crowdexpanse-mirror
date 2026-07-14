import { test } from "node:test";
import assert from "node:assert/strict";

import { manualAdapter, MANUAL_ADAPTER_VERSION } from "../../../lib/intelligence/sources/manual-adapter";
import type { RefreshContext } from "../../../lib/intelligence/sources/types";

const ctx: RefreshContext = { entityType: "OWNER", entityId: "owner-1", asOf: new Date("2026-06-01T00:00:00.000Z") };

test("adapter identity — manual, USER_ENTERED, versioned", () => {
  assert.equal(manualAdapter.sourceKey, "manual");
  assert.equal(manualAdapter.sourceCategory, "USER_ENTERED");
  assert.equal(manualAdapter.adapterVersion, MANUAL_ADAPTER_VERSION);
});

test("fetch echoes the submitted records (no external I/O)", async () => {
  const records = [{ fieldKey: "displayName", value: "Acme LLC" }];
  const out = await manualAdapter.fetch({ targetEntityType: "OWNER", targetEntityId: "owner-1", asOf: ctx.asOf, records });
  assert.deepEqual(out, records);
});

test("map — a valid displayName produces a normalized candidate on the target", () => {
  const [c] = manualAdapter.map({ fieldKey: "displayName", value: "Riverstone Capital LLC" }, ctx);
  assert.equal(c.rejected, undefined);
  assert.equal(c.entityType, "OWNER");
  assert.equal(c.entityId, "owner-1");
  assert.equal(c.fieldKey, "displayName");
  assert.equal(c.valueRaw, "Riverstone Capital LLC");
  assert.equal(c.valueNormalized, "RIVERSTONE CAPITAL LLC");
  assert.equal(c.method, "manual");
  assert.equal(c.asOf, ctx.asOf); // asOf comes from the run context (replayable)
});

test("map — a valid entityType keeps the enum label as its normalized value", () => {
  const [c] = manualAdapter.map({ fieldKey: "entityType", value: "TRUST" }, ctx);
  assert.equal(c.rejected, undefined);
  assert.equal(c.valueNormalized, "TRUST");
});

test("map — an unknown field is rejected (not silently dropped)", () => {
  const [c] = manualAdapter.map({ fieldKey: "hushHushField", value: "x" }, ctx);
  assert.ok(c.rejected);
  assert.match(c.rejected.reason, /unknown field/);
});

test("map — an empty / non-string value is rejected", () => {
  const [blank] = manualAdapter.map({ fieldKey: "displayName", value: "   " }, ctx);
  assert.ok(blank.rejected);
  const [nonString] = manualAdapter.map({ fieldKey: "displayName", value: 42 }, ctx);
  assert.ok(nonString.rejected);
  assert.equal(nonString.valueRaw, "42"); // still recorded verbatim for the reason
});

test("map — an invalid entityType label is rejected", () => {
  const [c] = manualAdapter.map({ fieldKey: "entityType", value: "SPACE_STATION" }, ctx);
  assert.ok(c.rejected);
  assert.match(c.rejected.reason, /invalid entityType/);
});
