import { test } from "node:test";
import assert from "node:assert/strict";

import { computeMatchKey, normalizeOwnerName } from "../../../lib/intelligence/owner-identity";

test("normalizeOwnerName canonicalizes LLC spellings to one form", () => {
  const forms = ["Smith Holdings, LLC", "Smith Holdings L.L.C.", "  smith   holdings llc ", "SMITH HOLDINGS L L C"];
  for (const f of forms) assert.equal(normalizeOwnerName(f), "SMITH HOLDINGS LLC");
});

test("normalizeOwnerName canonicalizes suffix synonyms", () => {
  assert.equal(normalizeOwnerName("Acme Incorporated"), "ACME INC");
  assert.equal(normalizeOwnerName("Acme Corporation"), "ACME CORP");
  assert.equal(normalizeOwnerName("Acme Company"), "ACME CO");
  assert.equal(normalizeOwnerName("Acme Limited"), "ACME LTD");
  assert.equal(normalizeOwnerName("Riverside, L.P."), "RIVERSIDE LP");
});

test("normalizeOwnerName strips punctuation (apostrophes, ampersands) and collapses whitespace", () => {
  assert.equal(normalizeOwnerName("O'Brien & Sons"), "O BRIEN SONS");
  assert.equal(normalizeOwnerName("Brown & Brown Trust"), "BROWN BROWN TRUST");
});

test("normalizeOwnerName returns empty string for empty/whitespace input", () => {
  assert.equal(normalizeOwnerName(""), "");
  assert.equal(normalizeOwnerName("   "), "");
});

test("computeMatchKey appends normalized jurisdiction when present", () => {
  assert.equal(computeMatchKey({ displayName: "Smith Holdings LLC" }), "SMITH HOLDINGS LLC");
  assert.equal(computeMatchKey({ displayName: "Smith Holdings LLC", jurisdiction: "ga" }), "SMITH HOLDINGS LLC|GA");
});

test("computeMatchKey is deterministic across equivalent spellings", () => {
  assert.equal(
    computeMatchKey({ displayName: "Smith Holdings, L.L.C." }),
    computeMatchKey({ displayName: "SMITH HOLDINGS LLC" }),
  );
});
