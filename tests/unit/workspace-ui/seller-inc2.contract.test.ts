import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL contract test (repo convention). Pins Increment-2's boundaries at the source level:
// existing services/actions reused (no replacements/new write paths), tenant-scoped, no direct
// opportunity creation, queue not re-sorted, existing timeline reused, comms honest, Increment-1
// primitives consumed unchanged, and accessibility semantics present.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const QUEUE_PAGE = read("app/(workspace)/seller-queue/page.tsx");
const RECORD_PAGE = read("app/(workspace)/seller-queue/[id]/page.tsx");
const QUEUE = read("components/workspace-ui/seller/SellerQueue.tsx");
const RECORD = read("components/workspace-ui/seller/SellerRecordView.tsx");
const SUBMIT = read("components/workspace-ui/seller/SubmitButton.tsx");
const ALL_TSX = [QUEUE_PAGE, RECORD_PAGE, QUEUE, RECORD, SUBMIT];

test("reuses EXISTING services + server actions (no replacement services)", () => {
  assert.match(QUEUE_PAGE, /getAcquisitionQueue|getDailyAcquisitionMetrics/);
  assert.match(RECORD_PAGE, /setSellerOutreachStatus/);
  assert.match(RECORD_PAGE, /recordDisposition/);
  assert.match(RECORD_PAGE, /logContactTouchAction/);
  assert.match(RECORD_PAGE, /resolveSellerPromotion/);
  assert.match(RECORD_PAGE, /sellerQualificationChecklist|checklistProgress/);
});

test("record route is tenant-scoped and 404s on a miss (no cross-tenant leak)", () => {
  assert.match(RECORD_PAGE, /requireUser\(\)/);
  assert.match(RECORD_PAGE, /organizationId: user\.organizationId/);
  assert.match(RECORD_PAGE, /notFound\(\)/);
  assert.match(QUEUE_PAGE, /requireUser\(\)/);
});

test("no new write path and NO direct opportunity creation in the new UI", () => {
  for (const s of ALL_TSX) {
    assert.doesNotMatch(s, /prisma\.(seller|opportunity)\.(update|create|delete)/, "no direct writes in the UI layer");
    assert.doesNotMatch(s, /createOpportunity|opportunity\.create/, "must not create an opportunity directly");
    assert.doesNotMatch(s, /\$transaction/, "no new transactional write path");
  }
  // Promotion is a LINK to the existing New-Opportunity path, not a create.
  assert.match(RECORD, /p\.promotion\.href/);
});

test("queue is NOT re-sorted client-side (order comes from the service)", () => {
  assert.doesNotMatch(QUEUE, /\.sort\(/);
  assert.doesNotMatch(QUEUE_PAGE, /\.sort\(/);
});

test("no invented priority/motivation score in the queue UI", () => {
  assert.doesNotMatch(QUEUE, /priorityScore|motivationScore/i);
  // the ordering copy explicitly says it is NOT a proprietary score
  assert.match(QUEUE, /not a proprietary score/i);
});

test("reuses the existing seller ActivityLog timeline (no second event history)", () => {
  assert.match(RECORD_PAGE, /activities: \{ orderBy/);
  assert.match(RECORD, /p\.activities/);
});

test("communications are shown as STATE only — no active send/dial controls", () => {
  for (const s of ALL_TSX) {
    assert.doesNotMatch(s, /sendCommsMessage|softphone|voice\/token/i, "no active comms controls in this increment");
  }
  assert.match(RECORD, /Sending is not part of this surface/);
});

test("consumes Increment-1 primitives (does not redefine them)", () => {
  assert.match(RECORD, /@\/components\/workspace-ui\/PageHeader/);
  assert.match(RECORD, /@\/components\/workspace-ui\/WorkspaceSection/);
  assert.match(RECORD, /@\/components\/workspace-ui\/TaxonomyBadge/);
  assert.match(QUEUE, /@\/components\/workspace-ui\/StateBlock/);
});

test("record distinguishes Observed / Computed / Recommended", () => {
  assert.match(RECORD, /kind="observed"/);
  assert.match(RECORD, /kind="computed"/);
  assert.match(RECORD, /kind="recommended"/);
});

test("accessibility: keyboard-reachable rows, labelled controls, pending submit, status not color-only", () => {
  assert.match(QUEUE, /<Link[\s\S]*?focus-visible:ring/); // rows are focusable links
  assert.match(RECORD, /<label/); // form controls are labelled
  assert.match(SUBMIT, /"use client"/);
  assert.match(SUBMIT, /useFormStatus/);
  assert.match(SUBMIT, /aria-busy=\{pending\}/);
  assert.match(QUEUE, /row\.status\.label/); // status conveyed as text, not color alone
  assert.match(RECORD, /sr-only/);
});

test("mutations that redirect are pointed back into this surface (redirectTo)", () => {
  assert.match(RECORD, /name="redirectTo"/);
  assert.match(RECORD, /recordHref/);
});
