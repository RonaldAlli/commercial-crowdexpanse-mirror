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
