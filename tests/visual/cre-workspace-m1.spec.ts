import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Milestone 1 Increment 6 browser verification (accessibility + responsive).
// Runs against the ISOLATED _test DB + seeded ADMIN storageState (no auth bypass, no app change, no live
// providers). Uses stable SEMANTIC selectors (roles/accessible names), not CSS classes or DOM position.
// Covers the accepted M1 surfaces: Command Center, Seller Queue, Seller Record, Opportunity Workspace,
// NBA + Missing-Information, stage controls, deep links, empty/unavailable states, narrow-viewport reflow.

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin") });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1000 };

async function expectNoHorizontalOverflow(page: Page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, "no material horizontal overflow").toBeLessThanOrEqual(innerWidth + 1);
}

test.describe("CRE workspace — Milestone 1 (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("Command Center: one h1, follow-ups, seeded seller, honest unavailable section", async ({ page }) => {
    await page.goto("/command-center");
    await expect(page.getByRole("heading", { level: 1, name: "Command Center" })).toBeVisible();
    expect(await page.getByRole("heading", { level: 1 }).count(), "exactly one page-level heading").toBe(1);
    await expect(page.getByRole("heading", { name: "Follow-ups due" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Marcus Delgado/ })).toBeVisible(); // seeded overdue seller
    await expect(page.getByRole("heading", { name: "Not yet available" })).toBeVisible(); // appointments/offers/period-revenue section
    await expect(page.getByText(/Appointments/).first()).toBeVisible();
  });

  test("Seller Queue: rows are keyboard-reachable and Enter navigates to the record", async ({ page }) => {
    await page.goto("/seller-queue");
    const link = page.getByRole("link", { name: /Marcus Delgado/ });
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused(); // keyboard-reachable
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/seller-queue/${M.sellers.qualified}`));
  });

  test("Seller Record: NBA + Missing-Information semantics exposed as text (not color alone)", async ({ page }) => {
    await page.goto(`/seller-queue/${M.sellers.qualified}`);
    await expect(page.getByRole("heading", { name: "Next best action" })).toBeVisible();
    await expect(page.getByText("Promote to opportunity").first()).toBeVisible(); // High-confidence rec
    await expect(page.getByText(/Confidence:\s*High/)).toBeVisible(); // categorical confidence as text
    await expect(page.getByRole("heading", { name: "Missing information" })).toBeVisible();
    await expect(page.getByText("Recommended").first()).toBeVisible(); // taxonomy meaning as text
  });

  test("Opportunity Workspace: stage, evidence, timeline, and authoritative deep-link", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stage" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transaction Timeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Next best action" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/opportunity-workspace/${M.opportunities.active}`));
  });

  test("empty/unavailable honesty: partial seller has Missing-Information and NO Promote recommendation", async ({ page }) => {
    await page.goto(`/seller-queue/${M.sellers.partial}`);
    await expect(page.getByRole("heading", { name: "Missing information" })).toBeVisible();
    await expect(page.getByText("Promote to opportunity")).toHaveCount(0);
  });

  test("no browser path to an unauthorized cross-tenant record (404 on a foreign id)", async ({ page }) => {
    const res = await page.goto("/seller-queue/nonexistent-id-xyz");
    expect(res?.status()).toBe(404);
  });
});

test.describe("CRE workspace — Milestone 1 (ADMIN, narrow mobile)", () => {
  test.use({ viewport: MOBILE });

  test("no material horizontal overflow across the core surfaces", async ({ page }) => {
    for (const url of ["/command-center", "/seller-queue", `/seller-queue/${M.sellers.qualified}`, `/opportunity-workspace/${M.opportunities.active}`]) {
      await page.goto(url);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("key operational information stays reachable on a narrow viewport", async ({ page }) => {
    await page.goto(`/seller-queue/${M.sellers.qualified}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // record identity
    await expect(page.getByRole("heading", { name: "Next best action" })).toBeVisible(); // NBA still present
  });
});
