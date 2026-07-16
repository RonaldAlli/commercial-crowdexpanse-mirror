import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, oppPath, shot, type Manifest } from "./_helpers";

// Behavioral + accessibility + screenshot coverage for the Transaction Timeline (Closing Slice 6,
// TX-0) — a READ-ONLY chronological projection mounted on the Opportunity detail page. Asserts
// recorded events render with category chips, snapshot-reference deep-links OUT (TL-11), the
// newest/oldest toggle, the empty state, read-only (analyst) access, deep-link target presence,
// and a clean console — plus review screenshots. Manifest is read at RUN time (beforeAll).
let M: Manifest;
test.beforeAll(() => { M = manifest(); });

const TIMELINE = "#timeline";
const timelinePanel = (page: Page) => page.locator(TIMELINE);
const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 900, height: 1100 };
const MOBILE = { width: 390, height: 844 };

test.describe("transaction timeline (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("renders the recorded event history with category chips", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.getByRole("heading", { name: "Transaction Timeline" })).toBeVisible();
    const panel = timelinePanel(page);
    await expect(panel).toBeVisible();
    // The active deal was seeded through escrow, financing, and assignment — their events appear.
    await expect(panel.getByText("Escrow", { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Financing", { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("Assignment", { exact: true }).first()).toBeVisible();
    // The count summary reflects real recorded events (never zero for a driven deal).
    await expect(panel.getByText(/\d+ recorded events?/)).toBeVisible();
  });

  test("snapshot-reference entries deep-link OUT to the authoritative surface (TL-11)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const panel = timelinePanel(page);
    // An escrow event references the Closing Center on this same opportunity.
    const ref = panel.locator(`a[href="${oppPath(M.opportunities.active)}#closing-center"]`).first();
    await expect(ref).toBeVisible();
    // The deep-link target exists on the page (TL-6 links OUT, never edits inline).
    await expect(page.locator("#closing-center")).toBeVisible();
  });

  test("newest-first by default; the toggle switches to oldest-first", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const toggle = page.getByRole("link", { name: "Sort oldest first" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page).toHaveURL(/tlorder=oldest/);
    // Now the toggle offers the way back.
    await expect(page.getByRole("link", { name: "Sort newest first" })).toBeVisible();
  });

  test("an opportunity with no recorded events shows the empty state", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.empty));
    const panel = timelinePanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText("No activity yet")).toBeVisible();
  });

  test("no console errors on the opportunity detail page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(oppPath(M.opportunities.active));
    await expect(timelinePanel(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("review screenshots — desktop / tablet / mobile", async ({ page }) => {
    for (const [name, viewport] of [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", MOBILE]] as const) {
      await page.setViewportSize(viewport);
      await page.goto(oppPath(M.opportunities.active));
      await expect(timelinePanel(page)).toBeVisible();
      await timelinePanel(page).screenshot({ path: shot(`transaction-timeline-${name}`) });
    }
  });
});

test.describe("transaction timeline (read-only ANALYST)", () => {
  test.use({ storageState: authFile("analyst") });

  test("a CLOSING reader can view the timeline", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.getByRole("heading", { name: "Transaction Timeline" })).toBeVisible();
    await expect(timelinePanel(page).getByText(/\d+ recorded events?/)).toBeVisible();
    // Read-only surface — no mutating controls inside the timeline panel.
    await expect(timelinePanel(page).locator("button")).toHaveCount(0);
  });
});
