import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Global Navigation Integration verification.
// Confirms the released Milestone-1 surfaces are DISCOVERABLE from the global sidebar: the new
// Command Center + Seller Queue links are present, ordered (Command Center → Dashboard → Seller Queue),
// carry aria-current on their active route (including the /seller-queue/[id] deep child), are
// keyboard-activatable, and appear in the mobile drawer. Runs against the ISOLATED _test DB + seeded
// ADMIN storageState. Stable SEMANTIC selectors (roles/accessible names), scoped to the sidebar <aside>.
// No new backend/behavior — nav wiring only. Detail pages (Seller Record, Opportunity Workspace) are
// intentionally NOT sidebar entries; they remain deep-link destinations.

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin") });

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

const side = (page: Page) => page.locator("aside");
const navBtn = (page: Page, name: string) => side(page).getByRole("button", { name });

test.describe("Global nav — desktop (ADMIN)", () => {
  test.use({ viewport: DESKTOP });

  test("Command Center + Seller Queue links present, ordered CC → Dashboard → Seller Queue", async ({ page }) => {
    await page.goto("/command-center");
    const cc = navBtn(page, "Command Center");
    const dash = navBtn(page, "Dashboard");
    const sq = navBtn(page, "Seller Queue");
    await expect(cc).toBeVisible();
    await expect(dash).toBeVisible();
    await expect(sq).toBeVisible();
    const ys = await Promise.all([cc, dash, sq].map(async (l) => (await l.boundingBox())!.y));
    expect(ys[0], "Command Center above Dashboard").toBeLessThan(ys[1]);
    expect(ys[1], "Dashboard above Seller Queue").toBeLessThan(ys[2]);
  });

  test("aria-current marks Command Center on /command-center (and not Dashboard)", async ({ page }) => {
    await page.goto("/command-center");
    await expect(navBtn(page, "Command Center")).toHaveAttribute("aria-current", "page");
    await expect(navBtn(page, "Dashboard")).not.toHaveAttribute("aria-current", "page");
  });

  test("Seller Queue active on /seller-queue AND on the /seller-queue/[id] record", async ({ page }) => {
    await page.goto("/seller-queue");
    await expect(navBtn(page, "Seller Queue")).toHaveAttribute("aria-current", "page");
    await page.goto(`/seller-queue/${M.sellers.qualified}`);
    await expect(navBtn(page, "Seller Queue"), "stays active on the deep child record").toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("keyboard: focus Command Center and activate with Enter", async ({ page }) => {
    await page.goto("/dashboard");
    const cc = navBtn(page, "Command Center");
    await cc.focus();
    await expect(cc).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/command-center/);
  });

  test("no sidebar entry for the deep-link-only detail surfaces", async ({ page }) => {
    await page.goto("/command-center");
    await expect(navBtn(page, "Seller Record")).toHaveCount(0);
    await expect(navBtn(page, "Opportunity Workspace")).toHaveCount(0);
  });
});

test.describe("Global nav — mobile drawer (ADMIN)", () => {
  test.use({ viewport: MOBILE });

  test("menu toggle opens the drawer and reveals the new links", async ({ page }) => {
    await page.goto("/command-center");
    const toggle = page.getByRole("button", { name: /navigation menu/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    const cc = navBtn(page, "Command Center");
    const beforeX = (await cc.boundingBox())!.x;
    expect(beforeX, "drawer closed → sidebar off-screen left").toBeLessThan(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const afterX = (await cc.boundingBox())!.x;
    expect(afterX, "drawer open → sidebar on-screen").toBeGreaterThanOrEqual(0);
    await expect(navBtn(page, "Seller Queue")).toBeVisible();
  });
});
