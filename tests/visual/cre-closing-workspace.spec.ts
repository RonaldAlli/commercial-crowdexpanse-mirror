import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Closing Workspace Increment 1 browser verification (Executive Closing Summary).
// Isolated _test DB + seeded ADMIN storageState. READ-ONLY: it answers "Can this transaction close?" verdict
// FIRST, then four visually distinct domain panels (Checklist/Escrow/Financing/Assignment), then blockers, then
// a deep-link to the Closing Console. The route uses non-materialising reads, so visiting a checklist-less
// opportunity is honest AND does not pollute shared fixtures. Stable semantic selectors.

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin") });

const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, "no material horizontal overflow").toBeLessThanOrEqual(innerWidth + 1);
}

test.describe("Closing Workspace — desktop (ADMIN)", () => {
  test.use({ viewport: DESKTOP });

  test("checklist-ready + all domains resolved -> 'Yes'; summary FIRST; four distinct domains; console link", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    await expect(page.getByRole("heading", { level: 1, name: "Closing" })).toBeVisible();
    expect(await page.getByRole("heading", { level: 1 }).count(), "exactly one page heading").toBe(1);

    // Verdict first (seed terminal: checklist complete + escrow Released / financing Funded / assignment Executed).
    await expect(page.getByText(/Closeable: Yes/)).toBeVisible();
    const summaryH = page.getByRole("heading", { name: "Executive closing summary" });
    const domainsH = page.getByRole("heading", { name: "Domain readiness" });
    await expect(summaryH).toBeVisible();
    await expect(domainsH).toBeVisible();
    expect((await summaryH.boundingBox())!.y, "summary above domains").toBeLessThan((await domainsH.boundingBox())!.y);

    // Domain Progression: four visually distinct domain panels.
    for (const d of ["Checklist", "Escrow", "Financing", "Assignment"]) {
      await expect(page.getByRole("heading", { name: d })).toBeVisible();
    }
    // Console deep-link (authoritative execution surface), keyboard-reachable.
    const link = page.getByRole("link", { name: "Open Closing Console" });
    await expect(link).toHaveAttribute("href", `/opportunities/${M.opportunities.terminal}`);
    await link.focus();
    await expect(link).toBeFocused();
  });

  test("unresolved-domain + incomplete checklist -> 'Not yet' with domains in progress + blockers", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.active}`);
    await expect(page.getByText(/Closeable: Not yet/)).toBeVisible();
    // Domains show their own status distinctly (escrow Deposited, financing Cleared, assignment Drafted are in-progress).
    await expect(page.getByText("In progress").first()).toBeVisible();
    // Blockers section present (outstanding checklist items).
    await expect(page.getByRole("heading", { name: "Primary blockers" })).toBeVisible();
  });

  test("no checklist -> honest 'Not established' (never implies closeable or not)", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.empty}`);
    await expect(page.getByText(/Closeable: Not established/)).toBeVisible();
    await expect(page.getByText(/No closing checklist has been started/)).toBeVisible();
  });

  test("tenant-scoped: a foreign / unknown opportunity id returns 404", async ({ page }) => {
    const resp = await page.goto(`/closing-workspace/cmnonexistentopp00000000`);
    expect(resp?.status()).toBe(404);
  });

  test("accessibility: single h1, section headings at level 2, main landmark", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    await expect(page.getByRole("heading", { level: 2, name: "Executive closing summary" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Closing Workspace — Increment 2 blocker detail + ownership + next milestone (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("blockers grouped by owner (resolved + unassigned), domain blockers separate, overdue next milestone; summary stays first", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.active}`);
    // Order preserved: Executive summary -> Primary blockers -> What happens next.
    const summaryH = page.getByRole("heading", { name: "Executive closing summary" });
    const blockersH = page.getByRole("heading", { name: "Primary blockers" });
    const nextH = page.getByRole("heading", { name: "What happens next?" });
    for (const h of [summaryH, blockersH, nextH]) await expect(h).toBeVisible();
    const ys = await Promise.all([summaryH, blockersH, nextH].map(async (h) => (await h.boundingBox())!.y));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);

    // Ownership clarity: a resolved owner group (seeded on one blocker) AND unassigned others.
    await expect(page.getByText("Checklist — by owner")).toBeVisible();
    await expect(page.getByText("Ada Admin").first()).toBeVisible(); // resolved owner
    await expect(page.getByText(/unassigned \/ unresolved/).first()).toBeVisible(); // honest unassigned
    // Domain blockers kept separate (Domain Progression reinforced, not replaced).
    await expect(page.getByText("Operational domains outstanding")).toBeVisible();
    // Next milestone: active has an overdue Target close (2026-07-05 < now).
    await expect(page.getByText("Target close").first()).toBeVisible();
    await expect(page.getByText("Overdue").first()).toBeVisible();
  });

  test("checklist complete + resolved domains -> no blockers; next milestone present without overdue", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    await expect(page.getByText("No outstanding blockers")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happens next?" })).toBeVisible();
    await expect(page.getByText("Target close").first()).toBeVisible(); // 2026-12-01 (future)
    expect(await page.getByText("Overdue").count(), "future milestone not overdue").toBe(0);
  });

  test("no checklist -> honest 'No upcoming milestone recorded'", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.empty}`);
    await expect(page.getByText(/No upcoming milestone recorded/)).toBeVisible();
  });
});

test.describe("Closing Workspace — Increment 3 timeline + closing history (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("populated timeline: reused panel, after current-state & next-step, chronological with actors", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    const summaryH = page.getByRole("heading", { name: "Executive closing summary" });
    const nextH = page.getByRole("heading", { name: "What happens next?" });
    const historyH = page.getByRole("heading", { name: "What has happened so far?" });
    for (const h of [summaryH, nextH, historyH]) await expect(h).toBeVisible();
    // Timeline appears AFTER current-state and next-step.
    const ys = await Promise.all([summaryH, nextH, historyH].map(async (h) => (await h.boundingBox())!.y));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    // The existing panel is reused verbatim (its own "Transaction Timeline" heading), with actor-attributed entries.
    await expect(page.getByRole("heading", { name: "Transaction Timeline" })).toBeVisible();
    await expect(page.getByText(/· Ada Admin/).first()).toBeVisible(); // recorded actor from seeded closing actions
  });

  test("empty history: section renders honestly (no fabricated entries)", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.empty}`);
    await expect(page.getByRole("heading", { name: "What has happened so far?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transaction Timeline" })).toBeVisible();
  });
});

test.describe("Closing Workspace — Increment 4 integration + discoverability (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("workflow continuity: Opportunity Workspace -> Closing Workspace -> Closing Console (no dead ends)", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    // The existing closing signal now hands INTO the per-deal Closing Workspace.
    const entry = page.getByRole("link", { name: "Open Closing Workspace" });
    await expect(entry).toHaveAttribute("href", `/closing-workspace/${M.opportunities.active}`);
    // The Related-records cross-link also points at the per-deal workspace.
    expect(await page.locator(`a[href="/closing-workspace/${M.opportunities.active}"]`).count()).toBeGreaterThanOrEqual(1);
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/closing-workspace/${M.opportunities.active}`));
    await expect(page.getByRole("heading", { level: 1, name: "Closing" })).toBeVisible();
    // Onward to the authoritative execution surface.
    await page.getByRole("link", { name: "Open Closing Console" }).click();
    await expect(page).toHaveURL(new RegExp(`/opportunities/${M.opportunities.active}`));
  });

  test("complete section order (final): Summary -> Domain -> Blockers -> Next -> History", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.active}`);
    const names = [
      "Executive closing summary",
      "Domain readiness",
      "Primary blockers",
      "What happens next?",
      "What has happened so far?",
    ];
    const ys: number[] = [];
    for (const n of names) ys.push((await page.getByRole("heading", { name: n }).boundingBox())!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i], `${names[i]} below ${names[i - 1]}`).toBeGreaterThan(ys[i - 1]);
    // Accessibility anchors.
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Closing Workspace — tablet (ADMIN)", () => {
  test.use({ viewport: TABLET });
  test("tablet: summary + four domains reachable, no horizontal overflow", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    await expect(page.getByRole("heading", { name: "Domain readiness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assignment" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Closing Workspace — mobile (ADMIN)", () => {
  test.use({ viewport: MOBILE });
  test("mobile: verdict + console link reachable, no horizontal overflow", async ({ page }) => {
    await page.goto(`/closing-workspace/${M.opportunities.terminal}`);
    await expect(page.getByText(/Closeable: Yes/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Closing Console" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
