import { test, expect, type Page } from "@playwright/test";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — UI Milestone 2 Increment 1 browser verification (Guided Underwriting).
// Isolated _test DB + seeded ADMIN storageState. Verifies the READ-ONLY operator workspace: it answers
// "Can we structure this deal?" with an Executive Structurability Summary from EXISTING persisted outputs,
// shows supporting metrics, deep-links to the authoritative /analyzer, handles the no-underwriting empty
// state honestly, and is tenant-scoped (404 on a foreign id). Stable semantic selectors.

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin") });

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, "no material horizontal overflow").toBeLessThanOrEqual(innerWidth + 1);
}

test.describe("Guided Underwriting — desktop (ADMIN)", () => {
  test.use({ viewport: DESKTOP });

  test("active scenario: executive summary leads with structurability + primary constraint + metrics", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    await expect(page.getByRole("heading", { level: 1, name: "Guided Underwriting" })).toBeVisible();
    expect(await page.getByRole("heading", { level: 1 }).count(), "exactly one page heading").toBe(1);

    // Structurability verdict (from persisted PROCEED_WITH_CONDITIONS) + engine recommendation as text.
    await expect(page.getByText("Structurable: Conditional").first()).toBeVisible();
    await expect(page.getByText("Engine recommendation:")).toBeVisible();
    await expect(page.getByText("Proceed with conditions", { exact: true })).toBeVisible();
    // Primary constraint from the persisted decisive finding.
    await expect(page.getByText("Thin debt yield (Senior Debt)")).toBeVisible();
    // Supporting metrics from persisted outputs (not fabricated).
    await expect(page.getByText("1.35×")).toBeVisible(); // DSCR
    await expect(page.getByText("$780,000")).toBeVisible(); // NOI
    await expect(page.getByText("6.2%")).toBeVisible(); // cap rate
  });

  test("advanced-analysis deep-link points at the authoritative analyzer and is keyboard-reachable", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    const link = page.getByRole("link", { name: "Advanced analysis" }).first();
    await expect(link).toHaveAttribute("href", `/analyzer/${M.opportunities.active}`);
    await link.focus();
    await expect(link).toBeFocused(); // keyboard-reachable
  });

  test("no active underwriting: honest empty state, no fabricated verdict or metrics", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.empty}`);
    await expect(page.getByRole("heading", { level: 1, name: "Guided Underwriting" })).toBeVisible();
    await expect(page.getByText(/Underwriting has not yet been started/)).toBeVisible();
    expect(await page.getByText("Structurable:").count(), "no fabricated structurability verdict").toBe(0);
    expect(await page.getByText("1.35×").count(), "no fabricated metrics").toBe(0);
  });

  test("tenant-scoped: a foreign / unknown opportunity id returns 404", async ({ page }) => {
    const resp = await page.goto(`/guided-underwriting/cmnonexistentopp00000000`);
    expect(resp?.status()).toBe(404);
  });
});

test.describe("Guided Underwriting — Increment 2 missing assumptions (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("missing-info section is grouped, four-state, with provenance — and the summary stays FIRST", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    const summaryH = page.getByRole("heading", { name: "Structurability summary" });
    const missingH = page.getByRole("heading", { name: "What information is preventing a complete answer?" });
    await expect(summaryH).toBeVisible();
    await expect(missingH).toBeVisible();
    // Executive Summary remains the entry point — it appears ABOVE the missing-info section.
    expect((await summaryH.boundingBox())!.y).toBeLessThan((await missingH.boundingBox())!.y);

    // Operational grouping from existing key-sets.
    for (const g of ["Core underwriting inputs", "Projection", "Debt & capital"]) {
      await expect(page.getByRole("heading", { name: g })).toBeVisible();
    }
    // Four distinct states present (seed: PURCHASE_PRICE complete, GROSS_INCOME incomplete, others missing).
    await expect(page.getByText("Complete").first()).toBeVisible();
    await expect(page.getByText("Incomplete").first()).toBeVisible();
    await expect(page.getByText("Missing").first()).toBeVisible();
    // Provenance rendered for present values; honest "no value" for absent ones — never fabricated.
    await expect(page.getByText(/Source:/).first()).toBeVisible();
    await expect(page.getByText("MANUAL").first()).toBeVisible();
    await expect(page.getByText(/No value on file/).first()).toBeVisible();
    // Completeness enriches (not replaces) the summary.
    await expect(page.getByText(/input\(s\) missing/)).toBeVisible();
  });

  test("no underwriting: the missing-info section is absent (honest), not fabricated", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.empty}`);
    expect(await page.getByRole("heading", { name: "What information is preventing a complete answer?" }).count()).toBe(0);
  });
});

test.describe("Guided Underwriting — mobile (ADMIN)", () => {
  test.use({ viewport: MOBILE });

  test("narrow viewport: summary + missing-info + analyzer link reachable, no horizontal overflow", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    await expect(page.getByText("Structurable: Conditional").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What information is preventing a complete answer?" })).toBeVisible();
    await expect(page.getByText(/Source:/).first()).toBeVisible(); // provenance readable on mobile
    await expect(page.getByRole("link", { name: "Advanced analysis" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
