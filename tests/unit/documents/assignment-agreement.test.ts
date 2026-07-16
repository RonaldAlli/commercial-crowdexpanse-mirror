import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assembleAssignmentAgreementSnapshot,
  renderAssignmentAgreementHtml,
  escapeHtml,
  fmtUsd,
  fmtDateUtc,
  ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION,
  ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION,
  ASSIGNMENT_AGREEMENT_GENERATOR_VERSION,
  type AssignmentAgreementInput,
  type AssignmentAgreementMeta,
} from "../../../lib/documents/assignment-agreement";

// A representative, fully-populated input.
function mkInput(over: Partial<AssignmentAgreementInput> = {}): AssignmentAgreementInput {
  return {
    opportunity: { id: "opp-1", title: "Riverside acquisition", contractValueUsd: 1_200_000, assignmentFeeUsd: 45_000 },
    property: {
      name: "Riverside Apartments",
      assetType: "MULTIFAMILY",
      addressLine1: "100 River Rd",
      city: "Atlanta",
      state: "GA",
      postalCode: "30301",
      county: "Fulton",
    },
    assignor: { name: "Jane Seller", contact: "jane@example.com" },
    assignee: { name: "Acme Capital LLC", contact: "buyer@example.com" },
    ...over,
  };
}

const META: AssignmentAgreementMeta = {
  generatedAtIso: "2026-07-16T15:00:00.000Z",
  generatedById: "user-1",
  generatedByDisplay: "Sam Rivera",
};

// --- formatters --------------------------------------------------------------
test("formatters are deterministic and locale-independent", () => {
  assert.equal(fmtUsd(1_200_000), "$1,200,000");
  assert.equal(fmtUsd(-1_200), "-$1,200");
  assert.equal(fmtUsd(0), "$0");
  assert.equal(fmtUsd(null), "—");
  assert.equal(fmtUsd(undefined), "—");
  assert.equal(fmtUsd(1_234.6), "$1,235"); // whole-dollar rounding
  assert.equal(fmtUsd(Number.NaN), "—");
  assert.equal(fmtUsd(Number.POSITIVE_INFINITY), "—");
});

test("fmtDateUtc uses a fixed UTC policy and degrades on an invalid date", () => {
  assert.equal(fmtDateUtc("2026-07-16T15:00:00.000Z"), "Jul 16, 2026 15:00 UTC");
  assert.equal(fmtDateUtc("not-a-date"), "not-a-date");
});

// --- escaping / injection safety --------------------------------------------
test("escapeHtml neutralizes markup and quotes", () => {
  assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
});

test("data-derived markup cannot inject into the rendered document", () => {
  const html = renderAssignmentAgreementHtml(
    assembleAssignmentAgreementSnapshot(
      mkInput({
        property: { ...mkInput().property, name: `<img src=x onerror="alert(1)">` },
        assignor: { name: `</style><script>alert(2)</script>`, contact: `<b>x</b>` },
        assignee: { name: `Acme & "Co"`, contact: null },
      }),
      META,
    ),
  );
  assert.ok(!html.includes("<script>alert(2)</script>"));
  assert.ok(!html.includes(`onerror="alert(1)"`));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes("Acme &amp; &quot;Co&quot;"));
});

// --- determinism / reproducibility (AS-15) -----------------------------------
test("the same snapshot renders byte-identical output", () => {
  const snap = assembleAssignmentAgreementSnapshot(mkInput(), META);
  assert.equal(renderAssignmentAgreementHtml(snap), renderAssignmentAgreementHtml(snap));
  const again = assembleAssignmentAgreementSnapshot(mkInput(), META);
  assert.equal(renderAssignmentAgreementHtml(again), renderAssignmentAgreementHtml(snap));
});

// --- snapshot fidelity + version stamps (AS-15) ------------------------------
test("the snapshot records template/generator/schema versions and generation meta", () => {
  const snap = assembleAssignmentAgreementSnapshot(mkInput(), META);
  assert.equal(snap.meta.snapshotSchemaVersion, ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snap.meta.templateVersion, ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION);
  assert.equal(snap.meta.generatorVersion, ASSIGNMENT_AGREEMENT_GENERATOR_VERSION);
  assert.equal(snap.meta.generatedAtIso, META.generatedAtIso);
  assert.equal(snap.meta.generatedById, "user-1");
  assert.equal(snap.meta.generatedByDisplay, "Sam Rivera");
});

test("assembly copies (does not alias) the input sub-objects", () => {
  const input = mkInput();
  const snap = assembleAssignmentAgreementSnapshot(input, META);
  assert.notEqual(snap.opportunity, input.opportunity);
  assert.notEqual(snap.property, input.property);
  assert.notEqual(snap.assignor, input.assignor);
  assert.notEqual(snap.assignee, input.assignee);
  assert.deepEqual(snap.opportunity, input.opportunity);
});

// --- rendered content --------------------------------------------------------
test("the agreement surfaces parties, fee, contract value and property", () => {
  const html = renderAssignmentAgreementHtml(assembleAssignmentAgreementSnapshot(mkInput(), META));
  assert.ok(html.includes("Jane Seller"));
  assert.ok(html.includes("Acme Capital LLC"));
  assert.ok(html.includes("$45,000")); // assignment fee
  assert.ok(html.includes("$1,200,000")); // underlying contract value
  assert.ok(html.includes("Riverside Apartments"));
  assert.ok(html.includes("Multifamily")); // asset type title-cased
  assert.ok(html.includes("100 River Rd"));
  assert.ok(html.includes("Riverside acquisition")); // opportunity reference
});

// --- self-contained output (no external dependencies) ------------------------
test("the rendered document has no external references", () => {
  const html = renderAssignmentAgreementHtml(assembleAssignmentAgreementSnapshot(mkInput(), META));
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!/https?:\/\//i.test(html), "no absolute http(s) URLs");
  assert.ok(!/<link\b/i.test(html), "no <link> stylesheets");
  assert.ok(!/src\s*=/i.test(html), "no src= attributes (scripts/images)");
  assert.ok(!/@import/i.test(html), "no CSS @import");
});

// --- missing optional values render cleanly, never crash ---------------------
test("absent parties, address parts and money render as em dashes without 'undefined'", () => {
  const bare = mkInput({
    opportunity: { id: "opp-2", title: "Bare deal", contractValueUsd: null, assignmentFeeUsd: null },
    property: { name: "Lot 7", assetType: "LAND", addressLine1: null, city: null, state: null, postalCode: null, county: null },
    assignor: { name: null, contact: null },
    assignee: { name: "   ", contact: null }, // whitespace-only name → treated as absent
  });
  const html = renderAssignmentAgreementHtml(assembleAssignmentAgreementSnapshot(bare, META));
  assert.ok(html.includes("—"));
  assert.ok(!html.includes("undefined"));
  assert.ok(!html.includes("null"));
  assert.ok(html.includes("Lot 7"));
});

test("a partial address (city/state only) omits the missing pieces", () => {
  const html = renderAssignmentAgreementHtml(
    assembleAssignmentAgreementSnapshot(
      mkInput({
        property: { ...mkInput().property, addressLine1: null, postalCode: null, county: null },
      }),
      META,
    ),
  );
  assert.ok(html.includes("Atlanta, GA"));
  assert.ok(!html.includes("undefined"));
});
