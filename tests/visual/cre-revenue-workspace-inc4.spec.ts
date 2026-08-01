import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Revenue Workspace, Milestone 1, Increment 4.
// Integration + discoverability + accessibility + responsive + workflow continuity. The Revenue Workspace is an
// INTENTIONAL BRANCH of the Opportunity Workspace (Opportunity → Revenue → Revenue Workspace), NOT a competing
// top-level entry — while the existing branches (Guided Underwriting / Closing Workspace / Closing Console) are
// preserved. Read-only; uses non-pristine seeded opportunities (no shared-fixture pollution).

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin") });

const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, "no material horizontal overflow").toBeLessThanOrEqual(iw + 1);
}

test.describe("Revenue Workspace — Increment 4 integration + discoverability (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("Opportunity → Revenue → Revenue Workspace: the Revenue section branches out to /revenue", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    const section = page.getByRole("region", { name: "Revenue" });
    const link = section.getByRole("link", { name: "Open Revenue Workspace →" });
    await expect(link).toHaveAttribute("href", "/revenue");
    await link.click();
    await expect(page).toHaveURL(/\/revenue$/);
    await expect(page.getByRole("heading", { level: 1, name: "Revenue" })).toBeVisible();
  });

  test("workflow continuity: the existing intentional branches are all preserved alongside Revenue", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    // Revenue (new) + the existing exits coexist — Revenue is additional, not a replacement.
    await expect(page.getByRole("link", { name: "Open Revenue Workspace →" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Closing Workspace →" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Closing Console →" })).toBeVisible();
    // Guided Underwriting remains reachable (its destination is linked from the workspace — Related records
    // and, for a deal with a scenario, the Revenue Projected tier both point here).
    await expect(page.locator(`a[href="/guided-underwriting/${M.opportunities.active}"]`).first()).toBeVisible();
  });

  test("Revenue Workspace is NOT a competing top-level nav entry (discovered through the workflow)", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    // The global nav must not carry a /revenue entry (Workspace Discoverability: no menu growth).
    await expect(page.getByRole("navigation").locator('a[href="/revenue"]')).toHaveCount(0);
  });

  test("accessibility: /revenue has a single h1, a main landmark, and labelled sections", async ({ page }) => {
    await page.goto("/revenue");
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    await expect(page.getByRole("heading", { level: 1, name: "Revenue" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("region", { name: "Revenue health" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Realized revenue by channel" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Realized revenue — deals" })).toBeVisible();
  });
});

test.describe("Revenue Workspace — Increment 4 responsive (ADMIN)", () => {
  test("tablet: /revenue reachable, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto("/revenue");
    await expect(page.getByRole("region", { name: "Revenue health" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("mobile: /revenue reachable, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/revenue");
    await expect(page.getByRole("heading", { level: 1, name: "Revenue" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
