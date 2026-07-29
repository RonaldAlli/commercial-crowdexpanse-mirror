import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL contract test (repo convention). Pins Increment-3 boundaries at the source level.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PAGE = read("app/(workspace)/opportunity-workspace/[id]/page.tsx");
const VIEW = read("components/workspace-ui/opportunity/OpportunityWorkspace.tsx");
const BOTH = [PAGE, VIEW];

test("tenant-scoped lookup, 404 on a miss", () => {
  assert.match(PAGE, /requireUser\(\)/);
  assert.match(PAGE, /organizationId: user\.organizationId/);
  assert.match(PAGE, /notFound\(\)/);
});

test("reuses EXISTING capabilities only (no replacement services)", () => {
  assert.match(PAGE, /moveOpportunityStage/);
  assert.match(PAGE, /evaluateStageMove/);
  assert.match(PAGE, /getOpportunityTimeline/);
  assert.match(PAGE, /getClosingGateStatus/);
  assert.match(PAGE, /summarizeDiligence/);
  assert.match(PAGE, /STAGE_OPTIONS/);
  assert.match(VIEW, /@\/components\/stage-select/);
  assert.match(VIEW, /@\/components\/transaction-timeline-panel/);
});

test("native OpportunityStage authoritative; dormant projection NEVER touched", () => {
  for (const s of BOTH) {
    assert.doesNotMatch(s, /pipeline-projection|pipeline-facts|pipeline-view-models|PipelineFact/, "must not use the dormant projection layer");
  }
});

test("no new write path and no direct opportunity mutation in the UI layer", () => {
  for (const s of BOTH) {
    assert.doesNotMatch(s, /prisma\.opportunity\.(update|create|delete)/);
    assert.doesNotMatch(s, /\$transaction/);
  }
  // stage change goes through the existing action via StageSelect
  assert.match(PAGE, /moveOpportunityStage\.bind\(null, opp\.id\)/);
});

test("reuses the existing transaction timeline (no second event history)", () => {
  assert.match(VIEW, /TransactionTimelinePanel/);
  assert.doesNotMatch(VIEW, /activityLog|prisma\./i); // the component queries nothing
});

test("no Missing-Information synthesis and no new recommendation logic", () => {
  for (const s of BOTH) {
    assert.doesNotMatch(s, /@\/lib\/workspace-ui\/missing-info|MissingInfoBadge/, "Missing-Info synthesis is Increment 5");
  }
  // suggestedAction is displayed verbatim (Recommended), not computed here
  assert.match(VIEW, /r\.suggestedAction/);
  assert.match(VIEW, /kind="recommended"/);
});

test("no underwriting calculations pulled in (underwriting is a future workspace)", () => {
  for (const s of BOTH) {
    assert.doesNotMatch(s, /getActiveScenarioResult|@\/lib\/analysis|@\/lib\/underwriting/);
  }
});

test("consumes Increment-1 primitives (unchanged) and shows the O/C/R taxonomy", () => {
  assert.match(VIEW, /@\/components\/workspace-ui\/PageHeader/);
  assert.match(VIEW, /@\/components\/workspace-ui\/WorkspaceSection/);
  assert.match(VIEW, /@\/components\/workspace-ui\/TaxonomyBadge/);
  assert.match(VIEW, /kind="observed"/);
  assert.match(VIEW, /kind="computed"/);
  assert.match(VIEW, /kind="recommended"/);
});

test("Increment-2 seller handoff preserved (links to the seller record)", () => {
  assert.match(PAGE, /\/seller-queue\//);
  assert.match(VIEW, /\/seller-queue\//);
});

test("cross-links only where available; unavailable destinations are not implied", () => {
  assert.match(VIEW, /c\.available \?/);
  assert.match(VIEW, /aria-disabled="true"/);
  assert.match(VIEW, /none available/);
});

test("accessibility: focus-visible links, descriptive cross-link names, status conveyed as text", () => {
  assert.match(VIEW, /focus-visible:ring/);
  assert.match(VIEW, /gate\.statusLabel/); // closing status as text, not color alone
  assert.match(VIEW, /positionLabel/); // stage position as text
});

test("blocked stage move is explained (DENY message rendered)", () => {
  assert.match(VIEW, /r\.outcome === "DENY" && r\.message/);
});
