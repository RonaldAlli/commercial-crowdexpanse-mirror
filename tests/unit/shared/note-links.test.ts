import { test } from "node:test";
import assert from "node:assert/strict";

import { NOTE_LINK_META, NOTE_LINK_TYPES, resolveNoteLink } from "../../../lib/note-links";

test("the four link types each have consistent metadata", () => {
  assert.deepEqual(NOTE_LINK_TYPES, ["seller", "buyer", "property", "opportunity"]);
  for (const t of NOTE_LINK_TYPES) {
    const meta = NOTE_LINK_META[t];
    assert.ok(meta.label && meta.field.endsWith("Id") && meta.hrefBase.startsWith("/"));
  }
});

test("resolves a seller link (name + href)", () => {
  const r = resolveNoteLink({ seller: { id: "s1", name: "Jane" } });
  assert.deepEqual(r, { type: "seller", label: "Seller", name: "Jane", href: "/sellers/s1" });
});

test("resolves buyer / property / opportunity links", () => {
  assert.equal(resolveNoteLink({ buyer: { id: "b1", name: "Buy Co" } })?.href, "/buyers/b1");
  assert.equal(resolveNoteLink({ property: { id: "p1", name: "123 Main" } })?.href, "/properties/p1");
  const opp = resolveNoteLink({ opportunity: { id: "o1", title: "Deal X" } });
  assert.deepEqual(opp, { type: "opportunity", label: "Opportunity", name: "Deal X", href: "/opportunities/o1" });
});

test("seller wins when multiple relations are present (priority order)", () => {
  const r = resolveNoteLink({ seller: { id: "s1", name: "Jane" }, buyer: { id: "b1", name: "Buy Co" } });
  assert.equal(r?.type, "seller");
});

test("returns null when no relation is linked", () => {
  assert.equal(resolveNoteLink({}), null);
  assert.equal(resolveNoteLink({ seller: null, buyer: null, property: null, opportunity: null }), null);
});
