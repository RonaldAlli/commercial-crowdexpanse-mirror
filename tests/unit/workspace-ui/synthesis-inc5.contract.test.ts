import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL contract test (repo convention). Pins Increment-5 boundaries at the source level.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ENGINE = read("lib/workspace-ui/synthesis.ts");
const PANEL = read("components/workspace-ui/synthesis/SynthesisPanel.tsx");
const SELLER_PAGE = read("app/(workspace)/seller-queue/[id]/page.tsx");
const OPP_PAGE = read("app/(workspace)/opportunity-workspace/[id]/page.tsx");

test("engine is pure & deterministic: no clock, no random, no data access, no mutation", () => {
  assert.doesNotMatch(ENGINE, /Date\.now|Math\.random|new Date\(\)/, "no clock/random — now is injected");
  assert.doesNotMatch(ENGINE, /@\/lib\/prisma|\bprisma\.|\bfetch\(/, "no data access");
});

test("engine is advisory only — it decides nothing and calls no governed workflow", () => {
  assert.doesNotMatch(ENGINE, /moveOpportunityStage|createOpportunity|setSellerOutreachStatus|recordDisposition/, "advises, never decides");
});

test("no numeric/probabilistic confidence — categorical only", () => {
  assert.match(ENGINE, /ConfidenceCategory = "High" \| "Medium" \| "Low" \| "Review Required" \| "Not Yet Scored"/);
  // no numeric/probabilistic confidence (the word "score" legitimately appears in honest disclaimers)
  assert.doesNotMatch(ENGINE, /probability|Math\.round|confidence: ?[0-9]|numericConfidence|confidenceScore/i);
});

test("documented deterministic precedence is stated in code", () => {
  assert.match(ENGINE, /SELLER_PRECEDENCE/);
  assert.match(ENGINE, /OPPORTUNITY_PRECEDENCE/);
  assert.match(ENGINE, /DOCUMENTED PRECEDENCE/);
});

test("panel renders through the accepted Increment-1 primitives (not redefined)", () => {
  assert.match(PANEL, /@\/components\/workspace-ui\/EvidenceChain/);
  assert.match(PANEL, /@\/components\/workspace-ui\/MissingInfoBadge/);
  assert.match(PANEL, /@\/components\/workspace-ui\/WorkspaceSection/);
  // every recommendation shows evidence + the "why not the alternatives" + a categorical confidence chip
  assert.match(PANEL, /competingRejected/);
  assert.match(PANEL, /Confidence: /);
  assert.match(PANEL, /never a numeric score/);
});

test("panel exposes uncertainty + missing evidence accessibly (sr-only / text)", () => {
  assert.match(PANEL, /sr-only/);
  assert.match(PANEL, /m\.why/);
  assert.match(PANEL, /m\.resolution/);
});

test("wired additively into the Seller Record + Opportunity Workspace pages", () => {
  assert.match(SELLER_PAGE, /synthesizeSeller/);
  assert.match(SELLER_PAGE, /SynthesisPanel/);
  assert.match(OPP_PAGE, /synthesizeOpportunity/);
  assert.match(OPP_PAGE, /SynthesisPanel/);
});

test("wiring reuses ALREADY-LOADED facts (no new fetch/service added for synthesis)", () => {
  // the synthesis consumes the checklist/promotion/gate the pages already computed; it adds no query
  assert.doesNotMatch(ENGINE, /findFirst|findMany/);
  assert.doesNotMatch(PANEL, /prisma|findFirst|findMany|-service"/);
});
