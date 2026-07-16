import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, oppPath, shot, type Manifest } from "./_helpers";

// Behavioral + accessibility + screenshot coverage for the Opportunity-list Closing Badges
// (Slice 7 / Roadmap #7) — a READ-ONLY chip cluster beneath each Opportunity title on the LIST
// view. Asserts stage-aware visibility (LB-9: blocked / ready / "Closing not started" / quiet
// lead), the deep-link OUT to the Closing Center (LB-11), reader access, no mutation, and a clean
// console — plus review screenshots. Manifest is read at RUN time (beforeAll).
let M: Manifest;
test.beforeAll(() => { M = manifest(); });

const LIST = "/opportunities?view=list";
const rowFor = (page: Page, id: string) => page.locator("tr").filter({ has: page.locator(`a[href="${oppPath(id)}"]`) });
const clusterLink = (page: Page, id: string) => page.locator(`a[href="${oppPath(id)}#closing-center"]`);
const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 900, height: 1100 };
const MOBILE = { width: 390, height: 844 };

test.describe("opportunity-list closing badges (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("a blocked in-flight deal shows a blocker badge + per-domain status chips", async ({ page }) => {
    await page.goto(LIST);
    const row = rowFor(page, M.opportunities.active);
    await expect(row).toBeVisible();
    await expect(row).toContainText(/\d+ blockers?/);
    await expect(row).toContainText("Escrow");
    await expect(row).toContainText("Financing");
    await expect(row).toContainText("Assignment");
  });

  test("a ready deal shows Ready", async ({ page }) => {
    await page.goto(LIST);
    await expect(rowFor(page, M.opportunities.terminal).getByText("Ready", { exact: true })).toBeVisible();
  });

  test("an in-flight deal without a checklist shows 'Closing not started'", async ({ page }) => {
    await page.goto(LIST);
    const row = rowFor(page, M.opportunities.empty);
    await expect(row).toContainText("Closing not started");
    // No checklist + no domain records → no Escrow/Financing/Assignment chips.
    await expect(row).not.toContainText("Escrow");
  });

  test("an early-stage lead with no closing activity stays quiet (no cluster)", async ({ page }) => {
    await page.goto(LIST);
    const row = rowFor(page, M.opportunities.lead);
    await expect(row).toBeVisible();
    await expect(clusterLink(page, M.opportunities.lead)).toHaveCount(0);
    await expect(row).not.toContainText("Closing not started");
    await expect(row).not.toContainText("Ready");
  });

  test("the badge cluster links OUT to the Closing Center anchor (LB-11)", async ({ page }) => {
    await page.goto(LIST);
    const link = clusterLink(page, M.opportunities.active).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${M.opportunities.active}#closing-center$`));
    await expect(page.locator("#closing-center")).toBeVisible();
  });

  test("no mutating request is issued while viewing the list", async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", (req) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method())) mutations.push(`${req.method()} ${req.url()}`); });
    await page.goto(LIST);
    await expect(rowFor(page, M.opportunities.active)).toBeVisible();
    expect(mutations).toEqual([]);
  });

  test("no console errors on the list", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(LIST);
    await expect(rowFor(page, M.opportunities.active)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("review screenshots — desktop / tablet / mobile", async ({ page }) => {
    for (const [name, viewport] of [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", MOBILE]] as const) {
      await page.setViewportSize(viewport);
      await page.goto(LIST);
      await expect(rowFor(page, M.opportunities.active)).toBeVisible();
      await page.screenshot({ path: shot(`opportunity-list-badges-${name}`), fullPage: true });
    }
  });
});

test.describe("opportunity-list closing badges (read-only ANALYST)", () => {
  test.use({ storageState: authFile("analyst") });

  test("a reader sees the badges (no new RBAC, LB-6)", async ({ page }) => {
    await page.goto(LIST);
    await expect(rowFor(page, M.opportunities.terminal).getByText("Ready", { exact: true })).toBeVisible();
  });
});
