import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALIAS_CONFIDENCE,
  MATCH_KEY_CONFIDENCE,
  findOwnerCandidates,
  type ExistingOwner,
} from "../../../lib/intelligence/owner-identity";

const existing: ExistingOwner[] = [
  { id: "o1", matchKey: "SMITH HOLDINGS LLC" },
  { id: "o2", matchKey: "ACME CORP", aliasNormalizedValues: ["ACME CO", "ACME PARTNERS"] },
  { id: "o3", matchKey: "SMITH HOLDINGS LLC" }, // legitimate same-normalized-name collision
];

test("exact match-key produces a candidate at MATCH_KEY_CONFIDENCE", () => {
  const c = findOwnerCandidates({ displayName: "Smith Holdings, L.L.C." }, existing);
  const ids = c.map((x) => x.ownerId).sort();
  assert.deepEqual(ids, ["o1", "o3"]); // BOTH collide — proposals, never auto-linked
  assert.ok(c.every((x) => x.identityConfidence === MATCH_KEY_CONFIDENCE && x.reason === "exact-match-key"));
});

test("alias hit produces a lower-confidence candidate", () => {
  const c = findOwnerCandidates({ displayName: "Acme Company" }, existing); // normalizes to ACME CO (an alias of o2)
  assert.equal(c.length, 1);
  assert.equal(c[0].ownerId, "o2");
  assert.equal(c[0].identityConfidence, ALIAS_CONFIDENCE);
  assert.equal(c[0].reason, "alias-match");
});

test("no match returns an empty candidate list (never a link)", () => {
  assert.deepEqual(findOwnerCandidates({ displayName: "Unrelated Ventures LLC" }, existing), []);
});

test("candidates are ranked by identity confidence, match-key before alias", () => {
  const mixed: ExistingOwner[] = [
    { id: "a", matchKey: "OTHER", aliasNormalizedValues: ["RIVER OAKS LLC"] },
    { id: "b", matchKey: "RIVER OAKS LLC" },
  ];
  const c = findOwnerCandidates({ displayName: "River Oaks LLC" }, mixed);
  assert.deepEqual(c.map((x) => x.ownerId), ["b", "a"]);
  assert.ok(c[0].identityConfidence >= c[1].identityConfidence);
});

test("empty existing set yields no candidates", () => {
  assert.deepEqual(findOwnerCandidates({ displayName: "Anything LLC" }, []), []);
});

test("jurisdiction disambiguates the match key (no false candidate)", () => {
  const owners: ExistingOwner[] = [{ id: "ga", matchKey: "PEACH LLC|GA" }];
  assert.deepEqual(findOwnerCandidates({ displayName: "Peach LLC", jurisdiction: "FL" }, owners), []);
  assert.equal(findOwnerCandidates({ displayName: "Peach LLC", jurisdiction: "GA" }, owners).length, 1);
});
