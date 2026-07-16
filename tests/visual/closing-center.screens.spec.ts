import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, oppPath, shot, CLOSING_CENTER, type Manifest } from "./_helpers";

// Deterministic screenshot capture — REVIEW EVIDENCE (not committed golden snapshots). Covers
// the founder's required set across desktop / tablet / mobile, plus ADMIN vs non-admin controls
// and the no-active-underwriting empty state. Screenshots land under the ignored .artifacts dir.
// The manifest is read in beforeAll (run time, after globalSetup seeds), never at collection time.
let M: Manifest;
test.beforeAll(() => { M = manifest(); });
const trigger = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(title) });
const region = (page: Page, title: string) => page.getByRole("region", { name: new RegExp(title) });
const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 900, height: 1100 };
const MOBILE = { width: 390, height: 844 };

test.describe("desktop screenshots", () => {
  test.use({ storageState: authFile("admin"), viewport: DESKTOP });

  test("desktop — checklist open (default)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.locator(CLOSING_CENTER)).toBeVisible();
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("desktop-checklist-open") });
  });

  test("desktop — Escrow open", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow")).toBeVisible();
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("desktop-escrow-open") });
  });

  test("desktop — Financing open (with FC-0 reference)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Financing").click();
    await expect(region(page, "Financing")).toBeVisible();
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("desktop-financing-open") });
  });

  test("desktop — Assignment open (drafts + execute control)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Assignment").click();
    await expect(region(page, "Assignment")).toContainText("Draft 2");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("desktop-assignment-open") });
  });

  test("desktop — executed assignment immutable snapshot", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.terminal));
    await trigger(page, "Assignment").click();
    await expect(region(page, "Assignment")).toContainText("Executed terms (immutable)");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("desktop-assignment-executed") });
  });

  test("desktop — ADMIN terminal-resolution controls", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow").getByRole("button", { name: "Released" })).toBeVisible();
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("admin-terminal-controls") });
  });

  test("desktop — no active underwriting empty state", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.empty));
    await trigger(page, "Financing").click();
    await expect(region(page, "Financing")).toContainText("No active underwriting available.");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("no-active-underwriting") });
  });
});

test.describe("non-admin screenshot", () => {
  test.use({ storageState: authFile("writer"), viewport: DESKTOP });

  test("desktop — non-admin view without terminal-resolution controls", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow")).toContainText("admin action");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("nonadmin-no-terminal-controls") });
  });
});

test.describe("tablet screenshot", () => {
  test.use({ storageState: authFile("admin"), viewport: TABLET });

  test("tablet — Closing Center summary + sections", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.locator(CLOSING_CENTER)).toBeVisible();
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("tablet-closing-summary") });
  });
});

test.describe("mobile screenshots", () => {
  test.use({ storageState: authFile("admin"), viewport: MOBILE });

  test("mobile — readiness header + collapsed sections (long blocker in header)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.locator(CLOSING_CENTER)).toContainText("Phase II Environmental Site Assessment");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("mobile-collapsed-long-blocker") });
  });

  test("mobile — expanded Financing with a long lender value", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Financing").click();
    await expect(region(page, "Financing")).toContainText("Metropolitan Community Development Bank");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("mobile-financing-long-lender") });
  });

  test("mobile — expanded Escrow with a long holder value", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow")).toContainText("First American Title Insurance Company");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("mobile-escrow-long-holder") });
  });

  test("mobile — expanded Assignment with a long assignee value", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Assignment").click();
    await expect(region(page, "Assignment")).toContainText("Southeastern Value-Add Multifamily Opportunity Fund IV");
    await page.locator(CLOSING_CENTER).screenshot({ path: shot("mobile-assignment-long-assignee") });
  });
});
