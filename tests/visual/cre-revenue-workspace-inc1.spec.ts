import { test, expect } from "@playwright/test";

import { authFile } from "./_helpers";

// CRE Operating Workspace — Revenue Workspace, Milestone 1 (Realized Revenue), Increment 1.
// Organization-level Executive Summary at /revenue. READ-ONLY consumer of the business-intelligence
// authority. Verifies the Revenue Health card (Projected/Expected/Realized, distinct + labeled per the
// Financial Truthfulness contract), that only Realized carries an org-level figure while Expected/Projected
// are honestly "Measured per deal", and the realized by-channel / by-campaign sections. Not yet in nav
// (discoverability is Increment 4) — navigated by direct URL.

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Revenue Workspace — Increment 1 executive summary (ADMIN, desktop)", () => {
  test("executive answer first: single h1 + Revenue Health with three distinct, labeled tiers", async ({ page }) => {
    await page.goto("/revenue");
    await expect(page.getByRole("heading", { level: 1, name: "Revenue" })).toBeVisible();
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);

    const health = page.getByRole("region", { name: "Revenue health" });
    await expect(health).toBeVisible();
    // All three revenue concepts are present and labeled (Financial Truthfulness).
    for (const tier of ["Projected", "Expected", "Realized"]) {
      await expect(health.getByText(tier, { exact: true })).toBeVisible();
    }
  });

  test("Financial Truthfulness: only Realized has an org figure; Expected/Projected are per-deal (not fabricated)", async ({ page }) => {
    await page.goto("/revenue");
    const health = page.getByRole("region", { name: "Revenue health" });
    // Realized shows a currency value.
    await expect(health.getByText(/\$[\d,]+/).first()).toBeVisible();
    // Expected + Projected are honestly deferred to per-deal — two "Measured per deal" cells.
    await expect(health.getByText("Measured per deal")).toHaveCount(2);
    // The concepts are never summed together.
    await expect(health.getByText(/never summed into realized/i)).toBeVisible();
  });

  test("realized breakdowns present: by channel + by campaign (labeled 'Realized revenue')", async ({ page }) => {
    await page.goto("/revenue");
    await expect(page.getByRole("heading", { name: "Realized revenue by channel" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Realized revenue by campaign" })).toBeVisible();
  });

  test("auth gating: an unauthenticated request is redirected to login", async ({ page, context }) => {
    await context.clearCookies();
    const resp = await page.goto("/revenue");
    expect(resp?.status()).toBe(200); // lands on login after redirect
    await expect(page).toHaveURL(/\/login/);
  });
});
