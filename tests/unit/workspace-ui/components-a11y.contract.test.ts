import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// STRUCTURAL contract test (repo convention: node:test + tsx over source, no RTL/jsdom — see
// tests/unit/closing/closing-center-ui.test.ts). Pins the Increment-1 primitives' presentation-only +
// accessibility guarantees at the source level. Real-browser behavior is the domain of the Increment-6
// accessibility/responsiveness verification pass.

const C = (rel: string) => readFileSync(join(process.cwd(), "components/workspace-ui", rel), "utf8");
const FILES = [
  "TaxonomyBadge.tsx",
  "MissingInfoBadge.tsx",
  "EvidenceChain.tsx",
  "PageHeader.tsx",
  "WorkspaceSection.tsx",
  "RoleAwareNav.tsx",
  "StateBlock.tsx",
];
const SRC = Object.fromEntries(FILES.map((f) => [f, C(f)]));
const DEMO = readFileSync(join(process.cwd(), "app/(workspace)/dev/ui-primitives/page.tsx"), "utf8");

test("every primitive is presentation-only: no data access, services, actions, or fetch", () => {
  for (const [f, s] of Object.entries(SRC)) {
    assert.doesNotMatch(s, /@\/lib\/prisma|\bprisma\./, `${f} must not touch prisma`);
    assert.doesNotMatch(s, /-service"|-actions"/, `${f} must not import services/actions`);
    assert.doesNotMatch(s, /\bfetch\(|findFirst|findMany/, `${f} must not fetch/query`);
  }
});

test("every primitive includes a contract comment (guarantees / does not / later increments)", () => {
  for (const [f, s] of Object.entries(SRC)) {
    assert.match(s, /Contract:/, `${f} missing contract comment`);
    assert.match(s, /guarantees/, `${f} contract must state guarantees`);
    assert.match(s, /does NOT/, `${f} contract must state what it does not do`);
    assert.match(s, /later increments/, `${f} contract must state later-increment expectations`);
  }
});

test("decorative icons are aria-hidden; components expose sr-only text (not color/icon alone)", () => {
  for (const f of ["TaxonomyBadge.tsx", "MissingInfoBadge.tsx", "RoleAwareNav.tsx", "StateBlock.tsx", "EvidenceChain.tsx"]) {
    assert.match(SRC[f], /aria-hidden="true"/, `${f} must mark decorative icons aria-hidden`);
  }
  for (const f of ["TaxonomyBadge.tsx", "MissingInfoBadge.tsx", "StateBlock.tsx"]) {
    assert.match(SRC[f], /sr-only/, `${f} must carry a screen-reader label`);
  }
});

test("TaxonomyBadge renders a visible text label (never a color-only tag)", () => {
  assert.match(SRC["TaxonomyBadge.tsx"], /\{d\.label\}/);
  assert.match(SRC["TaxonomyBadge.tsx"], /\{d\.srLabel\}/);
});

test("EvidenceChain is a labelled group and shows honest empty states as text", () => {
  assert.match(SRC["EvidenceChain.tsx"], /role="group"/);
  assert.match(SRC["EvidenceChain.tsx"], /aria-labelledby=\{headingId\}/);
  assert.match(SRC["EvidenceChain.tsx"], /deriveEvidenceView/);
  assert.match(SRC["EvidenceChain.tsx"], /\(present\)|\(missing\)/);
});

test("PageHeader emits a single semantic h1 anchor", () => {
  assert.match(SRC["PageHeader.tsx"], /<h1\b/);
  assert.match(SRC["PageHeader.tsx"], /id=\{titleId\}/);
});

test("WorkspaceSection is an aria-labelledby section with a configurable heading level", () => {
  assert.match(SRC["WorkspaceSection.tsx"], /<section aria-labelledby=\{headingId\}/);
  assert.match(SRC["WorkspaceSection.tsx"], /headingLevel/);
});

test("RoleAwareNav: nav landmark, keyboard focus ring, aria-current, and future items are non-link + aria-disabled", () => {
  const s = SRC["RoleAwareNav.tsx"];
  assert.match(s, /<nav aria-label=/);
  assert.match(s, /focus-visible:ring/);
  assert.match(s, /aria-current=/);
  assert.match(s, /aria-disabled="true"/);
  assert.match(s, /not available yet/); // sr-only unavailability text
  // future items must NOT be rendered as links: the disabled branch uses <span>, not <Link>.
  assert.match(s, /if \(!item\.active\)[\s\S]*?<span[\s\S]*?aria-disabled="true"/);
});

test("StateBlock carries an ARIA live role and keeps unavailable distinct", () => {
  assert.match(SRC["StateBlock.tsx"], /role=\{d\.ariaRole\}/);
  assert.match(SRC["StateBlock.tsx"], /aria-live=/);
});

test("the demonstration route is gated OFF by default and reads no domain data", () => {
  assert.match(DEMO, /ENABLE_UI_DEV_PREVIEW !== "1"/);
  assert.match(DEMO, /notFound\(\)/);
  assert.doesNotMatch(DEMO, /@\/lib\/prisma|\bprisma\.|findFirst|findMany|-service"/);
});
