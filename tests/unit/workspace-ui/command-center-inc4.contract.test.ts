import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL contract test (repo convention). Pins Increment-4 boundaries at the source level.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PAGE = read("app/(workspace)/command-center/page.tsx");
const VIEW = read("components/workspace-ui/command-center/CommandCenter.tsx");
const LIB = read("lib/workspace-ui/command-center.ts");
const ALL = [PAGE, VIEW, LIB];

test("tenant-scoped, role-gated, read-only façade (no writes/mutations)", () => {
  assert.match(PAGE, /requireUser\(\)/);
  assert.match(PAGE, /organizationId: user\.organizationId/);
  assert.match(PAGE, /can\(user\.role, "READ", "SELLER"\)/);
  assert.match(PAGE, /can\(user\.role, "READ", "OPPORTUNITY"\)/);
  for (const s of ALL) {
    assert.doesNotMatch(s, /prisma\.\w+\.(update|create|delete)|\$transaction/, "read-only façade: no writes");
    assert.doesNotMatch(s, /-actions"|action=\{/, "no mutation actions in the Command Center");
  }
});

test("reuses EXISTING services (no replacement business services)", () => {
  assert.match(PAGE, /getAcquisitionQueue/);
  assert.match(PAGE, /getDailyAcquisitionMetrics/);
  assert.match(PAGE, /getTransactionDashboardRows/);
  assert.match(PAGE, /revenueByChannel/);
});

test("Opportunity Workspace is the authoritative deep-link target; no alternate opportunity detail", () => {
  assert.match(LIB, /\/opportunity-workspace\//);
  assert.match(VIEW, /\/seller-queue/); // seller deep links (mapQueue row hrefs + "Open queue")
  // the Command Center must not embed underwriting/diligence/closing DETAIL (only links out)
  for (const s of ALL) assert.doesNotMatch(s, /getActiveScenarioResult|@\/lib\/analysis|summarizeDiligence|getClosingGateStatus/);
});

test("no invented score / no NBA / no Missing-Info synthesis", () => {
  for (const s of ALL) {
    assert.doesNotMatch(s, /priorityScore|motivationScore|risk score|AI score/i);
    // no Missing-Info synthesis engine imported, and no NBA selection module wired in
    assert.doesNotMatch(s, /@\/lib\/workspace-ui\/missing-info|MissingInfoBadge/);
    assert.doesNotMatch(s, /nextBestAction|next-best-action|selectNextAction/i);
  }
  // the recent-opportunity ordering is documented as a deterministic rule, not a score
  assert.match(LIB, /RECENT_OPPORTUNITY_ORDER/);
  assert.match(LIB, /explicitly NOT a score/);
});

test("all-time revenue is labeled all-time; unavailable capabilities declared honestly", () => {
  assert.match(LIB, /basis: "All time"/);
  assert.doesNotMatch(LIB, /basis: "(this month|weekly|monthly|current period)"/i);
  assert.match(LIB, /UNAVAILABLE_CAPABILITIES = \["Appointments", "Offers", "Period-based revenue"\]/);
  assert.match(VIEW, /state="unavailable"/);
});

test("consumes Increment 1/2 primitives + reuses Increment-2 seller mapper (unchanged)", () => {
  assert.match(VIEW, /@\/components\/workspace-ui\/(PageHeader|WorkspaceSection|TaxonomyBadge|StateBlock)/);
  assert.match(LIB, /@\/lib\/workspace-ui\/seller-view/); // reuse mapQueue, not a new mapper
});

test("role-gated section visibility + honest empty/unavailable states", () => {
  assert.match(VIEW, /p\.sellers\.visible \?/);
  assert.match(VIEW, /p\.attention\.visible \?/);
  assert.match(VIEW, /state="empty"/);
});

test("accessibility: section headings, focus-visible links, urgency/overdue as text (not color-only)", () => {
  assert.match(VIEW, /WorkspaceSection/); // semantic aria-labelledby sections
  assert.match(VIEW, /focus-visible:ring/);
  assert.match(VIEW, /row\.followUp\.label/); // urgency conveyed as text
  assert.match(VIEW, /Overdue: /); // overdue conveyed as text
});
