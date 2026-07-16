import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, oppPath, CLOSING_CENTER, type Manifest } from "./_helpers";

// Behavioral + accessibility assertions for the Closing Center accordion (v1.4, Option C).
// These assert BEHAVIOR, not pixels: default-open, toggle + aria state, status-visible-while-
// collapsed, keyboard operability, no-mutation-on-toggle, role-gated controls, empty/terminal
// states, and that the PAID blocked-state explanation renders the authoritative outstanding set.
// The manifest is read in beforeAll — at RUN time, after globalSetup has seeded a fresh org and
// (re)written fixtures.json — never at import/collection time (which would capture stale ids).
let M: Manifest;
test.beforeAll(() => { M = manifest(); });
const trigger = (page: Page, title: string) => page.getByRole("button", { name: new RegExp(title) });
const region = (page: Page, title: string) => page.getByRole("region", { name: new RegExp(title) });

test.describe("accordion behavior (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("Closing Checklist defaults open; Escrow & Financing default collapsed", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(page.locator(CLOSING_CENTER)).toBeVisible();
    await expect(trigger(page, "Closing Checklist")).toHaveAttribute("aria-expanded", "true");
    await expect(region(page, "Closing Checklist")).toBeVisible();
    await expect(trigger(page, "Escrow")).toHaveAttribute("aria-expanded", "false");
    await expect(region(page, "Escrow")).toBeHidden();
    await expect(trigger(page, "Financing")).toHaveAttribute("aria-expanded", "false");
    await expect(region(page, "Financing")).toBeHidden();
  });

  test("Escrow & Financing expand and collapse; aria-expanded tracks state", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const esc = trigger(page, "Escrow");
    await esc.click();
    await expect(esc).toHaveAttribute("aria-expanded", "true");
    await expect(region(page, "Escrow")).toBeVisible();
    await esc.click();
    await expect(esc).toHaveAttribute("aria-expanded", "false");
    await expect(region(page, "Escrow")).toBeHidden();
  });

  test("status badge stays visible while a section is collapsed", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(region(page, "Escrow")).toBeHidden();
    await expect(trigger(page, "Escrow")).toContainText("Deposited");
    await expect(trigger(page, "Financing")).toContainText("Clear to close");
    await expect(trigger(page, "Assignment")).toContainText("Drafted");
  });

  test("keyboard: trigger is focusable; Enter and Space toggle the section", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const esc = trigger(page, "Escrow");
    await esc.focus();
    await expect(esc).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(esc).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(esc).toHaveAttribute("aria-expanded", "false");
  });

  test("collapsed panel content is hidden (not keyboard-focusable)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await expect(region(page, "Financing")).toBeHidden();
    await expect(page.getByRole("button", { name: "Save lender" })).toBeHidden();
    await trigger(page, "Financing").click();
    await expect(page.getByRole("button", { name: "Save lender" })).toBeVisible();
  });

  test("toggling sections issues NO POST/PATCH/PUT/DELETE (no server mutation)", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const mutations: string[] = [];
    page.on("request", (r) => {
      const m = r.method();
      if (["POST", "PATCH", "PUT", "DELETE"].includes(m)) mutations.push(`${m} ${r.url()}`);
    });
    await trigger(page, "Escrow").click();
    await trigger(page, "Financing").click();
    await trigger(page, "Escrow").click();
    await trigger(page, "Closing Checklist").click();
    await page.waitForTimeout(600);
    expect(mutations, `unexpected mutations: ${mutations.join(", ")}`).toEqual([]);
  });

  test("existing domain actions remain reachable inside expanded sections", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Financing").click();
    await expect(page.getByRole("button", { name: "Save lender" })).toBeVisible();
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow").getByText("Proof of deposit")).toBeVisible();
  });

  test("PAID blocked-state explanation lists the authoritative outstanding items", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const cc = page.locator(CLOSING_CENTER);
    await expect(cc).toContainText(/required item[s]? outstanding/);
    await expect(cc).toContainText("Phase II Environmental Site Assessment");
  });

  test("FC-0 active underwriting reference renders read-only debt figures", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Financing").click();
    const fin = region(page, "Financing");
    await expect(fin).toContainText("reference only");
    await expect(fin).toContainText("$4,200,000");
    await expect(fin).toContainText("1.35x");
  });

  test("Assignment section: drafted status, versioned drafts, and ADMIN execute control", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const asn = trigger(page, "Assignment");
    await expect(asn).toHaveAttribute("aria-expanded", "false");
    await asn.click();
    const region4 = region(page, "Assignment");
    await expect(region4).toBeVisible();
    // Versioned drafts (AS-M) + the long assignee value wraps rather than overflowing.
    await expect(region4).toContainText("Draft 1");
    await expect(region4).toContainText("Draft 2");
    await expect(region4).toContainText("Southeastern Value-Add Multifamily Opportunity Fund IV");
    // ADMIN sees the execute control (DRAFTED → EXECUTED, AS-G).
    await expect(region4.getByRole("button", { name: "Execute assignment" })).toBeVisible();
  });

  test("AS-N: the opportunity header shows an at-a-glance assignment summary badge", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.active));
    const stageCard = page.locator("article").filter({ hasText: "Stage" }).first();
    await expect(stageCard).toContainText("Assignment");
    await expect(stageCard).toContainText("Drafted");
  });

  test("no unexpected console errors on the Closing Center page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await trigger(page, "Financing").click();
    await page.waitForTimeout(400);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });
});

test.describe("empty + terminal states (ADMIN)", () => {
  test.use({ storageState: authFile("admin") });

  test("empty opportunity shows not-started / not-opened / no-underwriting", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.empty));
    await expect(page.locator(CLOSING_CENTER)).toContainText("Checklist not started");
    await expect(trigger(page, "Escrow")).toContainText("Not opened");
    await trigger(page, "Financing").click();
    await expect(region(page, "Financing")).toContainText("No active underwriting available.");
  });

  test("ready opportunity shows terminal escrow + financing and a ready header", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.terminal));
    await expect(page.locator(CLOSING_CENTER)).toContainText("Ready to close");
    await expect(trigger(page, "Escrow")).toContainText("Released");
    await expect(trigger(page, "Financing")).toContainText("Funded");
    await expect(trigger(page, "Assignment")).toContainText("Executed");
  });

  test("executed assignment shows the immutable executed-terms snapshot", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.terminal));
    await trigger(page, "Assignment").click();
    const region4 = region(page, "Assignment");
    await expect(region4).toContainText("Executed terms (immutable)");
    await expect(region4).toContainText("Frozen");
    // Fee snapshot at execution ($250,000) renders; the record no longer offers a Regenerate control.
    await expect(region4).toContainText("$250,000");
    await expect(region4.getByRole("button", { name: /Regenerate draft/ })).toHaveCount(0);
  });

  test("empty opportunity's assignment section is not-started with a start control", async ({ page }) => {
    await page.goto(oppPath(M.opportunities.empty));
    await expect(trigger(page, "Assignment")).toContainText("Not started");
    await trigger(page, "Assignment").click();
    await expect(region(page, "Assignment").getByRole("button", { name: "Start assignment tracking" })).toBeVisible();
  });
});

test.describe("role-gated terminal controls", () => {
  test("ADMIN sees escrow terminal-resolution controls", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile("admin") });
    const page = await ctx.newPage();
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow").getByRole("button", { name: "Released" })).toBeVisible();
    await ctx.close();
  });

  test("non-admin CLOSING writer does NOT see terminal-resolution controls", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile("writer") });
    const page = await ctx.newPage();
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Escrow").click();
    await expect(region(page, "Escrow")).toContainText("admin action");
    await expect(region(page, "Escrow").getByRole("button", { name: "Released" })).toHaveCount(0);
    await ctx.close();
  });

  test("non-admin CLOSING writer sees the admin-only note instead of Execute assignment", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: authFile("writer") });
    const page = await ctx.newPage();
    await page.goto(oppPath(M.opportunities.active));
    await trigger(page, "Assignment").click();
    const region4 = region(page, "Assignment");
    await expect(region4).toContainText("Executing the assignment is an admin action");
    await expect(region4.getByRole("button", { name: "Execute assignment" })).toHaveCount(0);
    await ctx.close();
  });
});
