import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Closing Center accordion (v1.4, Option C) — a STRUCTURAL contract test. The repo's unit
// infra is node:test + tsx over pure modules (no React Testing Library / jsdom), so the
// accordion's presentation-only + accessibility guarantees are pinned here at the source
// level. Behavior in a real browser is additionally covered by the manual responsive/empty-
// state verification matrix in the slice notes; the PAID gate itself is unchanged and stays
// E2E-covered by e2e-closing.mjs. These assertions encode the founder's acceptance list.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ACCORDION = read("components/accordion-section.tsx");
const PAGE = read("app/(workspace)/opportunities/[id]/page.tsx");

test("the accordion is a client island that manages only local open/closed state", () => {
  assert.match(ACCORDION, /^"use client";/m);
  assert.match(ACCORDION, /useState\(defaultOpen\)/);
});

test("opening/closing a section performs NO server round-trip or DB write", () => {
  // No Prisma, no server action, no service, no fetch — a toggle is pure client state.
  assert.doesNotMatch(ACCORDION, /@\/lib\/prisma/);
  assert.doesNotMatch(ACCORDION, /-actions"|-service"/);
  assert.doesNotMatch(ACCORDION, /\bfetch\(/);
  // The children (the domain cards) stay MOUNTED and are hidden when collapsed, so a card's
  // own state survives a toggle and no remount/refetch is triggered.
  assert.match(ACCORDION, /hidden=\{!open\}/);
});

test("the accordion trigger/panel carry accessible semantics (not icon/color alone)", () => {
  assert.match(ACCORDION, /<button/);
  assert.match(ACCORDION, /aria-expanded=\{open\}/);
  assert.match(ACCORDION, /aria-controls=\{panelId\}/);
  assert.match(ACCORDION, /role="region"/);
  assert.match(ACCORDION, /aria-labelledby=\{triggerId\}/);
  assert.match(ACCORDION, /focus-visible:ring/);
  // Status is conveyed as TEXT for screen readers, not by the badge color/icon alone.
  assert.match(ACCORDION, /sr-only/);
  assert.match(ACCORDION, /aria-hidden="true"/); // the chevron is decorative
});

test("the page groups all three domains inside one labelled Closing Center container", () => {
  assert.match(PAGE, /aria-labelledby="closing-center-heading"/);
  assert.match(PAGE, /id="closing-center-heading"[^>]*>Closing Center</);
  // The header renders the authoritative summary — no second readiness calculation.
  assert.match(PAGE, /closingReadinessSummary\(closing\.items\)/);
});

test("the Closing Checklist section defaults open; every section shows a status badge", () => {
  // Checklist section is the only one with defaultOpen (it governs PAID readiness).
  assert.match(PAGE, /<AccordionSection title="Closing Checklist"[^>]*defaultOpen>/);
  assert.doesNotMatch(PAGE, /<AccordionSection title="Escrow"[^>]*defaultOpen/);
  assert.doesNotMatch(PAGE, /<AccordionSection title="Financing"[^>]*defaultOpen/);
  // All three pass a status + tone so the badge is visible even when collapsed.
  for (const title of ["Closing Checklist", "Escrow", "Financing"]) {
    const re = new RegExp(`<AccordionSection title="${title}"[^>]*status=`);
    assert.match(PAGE, re, `${title} passes a status`);
  }
  assert.match(PAGE, /status=\{checklistStatus\} statusTone=\{checklistStatusTone\}/);
  assert.match(PAGE, /status=\{escrowStatusText\} statusTone=\{escrowStatusToneVal\}/);
  assert.match(PAGE, /status=\{financingStatusText\} statusTone=\{financingStatusToneVal\}/);
});

test("the existing self-contained domain cards render UNCHANGED inside the sections", () => {
  // Each card still receives its same prop set — the container only wraps, never reimplements.
  assert.match(PAGE, /<ClosingChecklist\b/);
  assert.match(PAGE, /<EscrowCard\b/);
  assert.match(PAGE, /<FinancingCard\b/);
  assert.match(PAGE, /canResolve=\{canResolveEscrowNow\}/);
  assert.match(PAGE, /canResolve=\{canResolveFinancingNow\}/);
  assert.match(PAGE, /underwritingRef=\{underwritingRef\}/); // FC-0 reference preserved
});
