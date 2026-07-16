import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, oppPath, shot, type Manifest } from "./_helpers";

// Behavioral + accessibility + screenshot coverage for the Transaction Dashboard (Closing
// Slice 5) — a READ-ONLY cross-opportunity projection at /closing. Asserts inclusion, readiness/
// blockers, per-domain status, overdue vs upcoming milestones, missing-record rows, the approved
// filters, row navigation OUT to the Closing Center, CLOSING-reader access, unauthorized
// rejection, no-mutation, and clean console — plus review screenshots. Manifest is read at RUN
// time (beforeAll), never at collection time.
let M: Manifest;
test.beforeAll(() => { M = manifest(); });

const DASH = "/closing";
const DASHBOARD = 'section[aria-label="In-flight transactions"]';
const rowFor = (page: Page, id: string) => page.locator(`a[href="${oppPath(id)}"]`);
const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 900, height: 1100 };
const MOBILE = { width: 390, height: 844 };

test.describe("transaction dashboard (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("lists every in-flight transaction with readiness + per-domain status", async ({ page }) => {
    await page.goto(DASH);
    await expect(page.getByRole("heading", { name: "Transaction Dashboard" })).toBeVisible();
    await expect(page.locator(DASHBOARD)).toBeVisible();
    // All three seeded in-flight (UNDER_CONTRACT) deals appear.
    await expect(rowFor(page, M.opportunities.empty)).toBeVisible();
    await expect(rowFor(page, M.opportunities.active)).toBeVisible();
    await expect(rowFor(page, M.opportunities.terminal)).toBeVisible();
    // Ready vs blocked vs not-started.
    await expect(rowFor(page, M.opportunities.terminal)).toContainText("Ready to close");
    await expect(rowFor(page, M.opportunities.active)).toContainText("required");
    await expect(rowFor(page, M.opportunities.empty)).toContainText("Checklist not started");
  });

  test("overdue and upcoming milestones render distinctly", async ({ page }) => {
    await page.goto(DASH);
    await expect(rowFor(page, M.opportunities.active)).toContainText("Overdue");
    await expect(rowFor(page, M.opportunities.terminal)).toContainText("Next");
  });

  test("per-domain status chips + missing records render (never excluded)", async ({ page }) => {
    await page.goto(DASH);
    // Active deal has escrow/financing/assignment; terminal deal shows terminal statuses.
    await expect(rowFor(page, M.opportunities.active)).toContainText("Deposited");
    await expect(rowFor(page, M.opportunities.terminal)).toContainText("Funded");
    await expect(rowFor(page, M.opportunities.terminal)).toContainText("Executed");
    // The empty deal (no domain records) still appears with an em-dash for status chips.
    await expect(rowFor(page, M.opportunities.empty)).toBeVisible();
  });

  test("many/long blockers are shown concisely (first few + a '+N more' overflow)", async ({ page }) => {
    await page.goto(DASH);
    const row = rowFor(page, M.opportunities.active);
    await expect(row).toContainText("Title search"); // the first outstanding blocker
    await expect(row).toContainText(/\+\d+ more/); // remaining blockers collapsed, not overflowing
  });

  test("approved filters: Ready narrows to ready deals; a stage with none shows the empty state", async ({ page }) => {
    await page.goto(DASH);
    await page.getByRole("link", { name: "Ready", exact: true }).click();
    await expect(page).toHaveURL(/ready=ready/);
    await expect(rowFor(page, M.opportunities.terminal)).toBeVisible();
    await expect(rowFor(page, M.opportunities.active)).toHaveCount(0);
    // No deal is at the CLOSING stage (all seeded in-flight are UNDER_CONTRACT) → empty state.
    await page.goto(`${DASH}?stage=CLOSING`);
    await expect(page.getByText("No transactions match these filters")).toBeVisible();
  });

  test("a row links OUT to the opportunity Closing Center (orchestration, not ownership)", async ({ page }) => {
    await page.goto(DASH);
    await rowFor(page, M.opportunities.active).click();
    await expect(page).toHaveURL(new RegExp(`/opportunities/${M.opportunities.active}$`));
    await expect(page.locator('section[aria-labelledby="closing-center-heading"]')).toBeVisible();
  });

  test("the dashboard issues NO mutating request (TX-3 read-only)", async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", (r) => {
      if (["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) mutations.push(`${r.method()} ${r.url()}`);
    });
    await page.goto(DASH);
    await page.getByRole("link", { name: "Ready", exact: true }).click();
    await page.getByRole("link", { name: "All", exact: true }).click();
    await page.waitForTimeout(400);
    expect(mutations, `unexpected mutations: ${mutations.join(", ")}`).toEqual([]);
  });

  test("keyboard + accessible name: a row is focusable and named by its deal", async ({ page }) => {
    await page.goto(DASH);
    const row = rowFor(page, M.opportunities.active);
    await row.focus();
    await expect(row).toBeFocused();
    await expect(row).toHaveAccessibleName(/Oakleaf Commons/);
  });

  test("no unexpected console errors on the dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(DASH);
    await page.getByRole("link", { name: "Not ready", exact: true }).click();
    await page.waitForTimeout(400);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });
});

test.describe("access control", () => {
  test("a CLOSING reader (ANALYST) can view the dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile("analyst") });
    const page = await ctx.newPage();
    await page.goto(DASH);
    await expect(page.getByRole("heading", { name: "Transaction Dashboard" })).toBeVisible();
    await expect(rowFor(page, M.opportunities.terminal)).toBeVisible();
    await ctx.close();
  });

  test("an unauthenticated request is rejected (redirected to login)", async ({ browser }) => {
    const ctx = await browser.newContext(); // no storageState
    const page = await ctx.newPage();
    await page.goto(DASH);
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});

test.describe("dashboard screenshots", () => {
  test.use({ storageState: authFile("admin") });

  test("desktop — full dashboard", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(DASH);
    await expect(page.locator(DASHBOARD)).toBeVisible();
    await page.screenshot({ path: shot("desktop-transaction-dashboard"), fullPage: true });
  });

  test("tablet — dashboard", async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto(DASH);
    await expect(page.locator(DASHBOARD)).toBeVisible();
    await page.screenshot({ path: shot("tablet-transaction-dashboard"), fullPage: true });
  });

  test("mobile — dashboard (rows stack, long blocker wraps)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(DASH);
    await expect(page.locator(DASHBOARD)).toBeVisible();
    await page.screenshot({ path: shot("mobile-transaction-dashboard"), fullPage: true });
  });
});
