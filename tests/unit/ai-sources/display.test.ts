import { test } from "node:test";
import assert from "node:assert/strict";

import type { SourceListEntry } from "../../../lib/ai/brain/prompt";
import { buildDisplaySources } from "../../../lib/ai/sources";

test("flattens fragment refs into structured DisplaySource items (not strings)", () => {
  const sources: SourceListEntry[] = [
    {
      label: "S1",
      key: "seller",
      providerLabel: "Seller",
      refs: [
        { kind: "seller", id: "s1", anchor: "seller", snippet: "Seller: Jane" },
        { kind: "seller", id: "s1", anchor: "motivation", snippet: "Motivation: relocating" },
      ],
    },
    {
      label: "S2",
      key: "timeline",
      providerLabel: "Recent timeline",
      refs: [{ kind: "timeline", anchor: "timeline-0", snippet: "Call (OUTBOUND, COMPLETED)" }],
    },
  ];
  const out = buildDisplaySources(sources);
  assert.equal(out.length, 3);
  const seller = out.find((d) => d.anchor === "seller");
  assert.ok(seller);
  assert.equal(seller!.kind, "seller");
  assert.equal(seller!.entityId, "s1");
  assert.equal(seller!.label, "Seller: Jane");
  assert.deepEqual(seller!.citations, ["S1"]);
});

test("deduplicates repeated references and preserves association to every citing [S#]", () => {
  // The same seller ref appears in two fragments (S1 and S3).
  const dupRef = { kind: "seller" as const, id: "s1", anchor: "seller", snippet: "Seller: Jane" };
  const sources: SourceListEntry[] = [
    { label: "S1", key: "seller", providerLabel: "Seller", refs: [dupRef] },
    { label: "S2", key: "timeline", providerLabel: "Recent timeline", refs: [{ kind: "timeline", anchor: "t0", snippet: "Call" }] },
    { label: "S3", key: "scoring", providerLabel: "Lead quality", refs: [dupRef] },
  ];
  const out = buildDisplaySources(sources);
  // One seller entry (deduped), one timeline entry.
  assert.equal(out.length, 2);
  const seller = out.find((d) => d.kind === "seller");
  assert.ok(seller);
  assert.deepEqual(seller!.citations, ["S1", "S3"]); // association to both citing labels preserved
});

test("empty sources → empty list", () => {
  assert.deepEqual(buildDisplaySources([]), []);
});
