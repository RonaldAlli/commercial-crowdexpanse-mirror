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
const TABLET = { width: 768, height: 1024 };
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
    // "Engine recommendation:" + the label also appear in Increment 3's "why" section — scope to the summary.
    await expect(page.getByLabel("Structurability summary").getByText("Engine recommendation:")).toBeVisible();
    await expect(page.getByLabel("Structurability summary").getByText("Proceed with conditions", { exact: true })).toBeVisible();
    // Primary constraint from the persisted decisive finding (also listed under "why" in Increment 3).
    await expect(page.getByText("Thin debt yield (Senior Debt)").first()).toBeVisible();
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

test.describe("Guided Underwriting — Increment 3 decision contrast + history (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("why-recommended + decision history render from persisted records, after the summary & missing-info", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    const summaryH = page.getByRole("heading", { name: "Structurability summary" });
    const missingH = page.getByRole("heading", { name: "What information is preventing a complete answer?" });
    const whyH = page.getByRole("heading", { name: "Why is this recommended?" });
    const historyH = page.getByRole("heading", { name: "Decision history" });
    for (const h of [summaryH, missingH, whyH, historyH]) await expect(h).toBeVisible();
    // Order: Executive Summary → Missing info → Why recommended → Decision history.
    const ys = await Promise.all([summaryH, missingH, whyH, historyH].map(async (h) => (await h.boundingBox())!.y));
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[3]);

    // Engine recommendation + a persisted finding under "why" (also shown as the summary's primary constraint).
    await expect(page.getByText("Thin debt yield (Senior Debt)").first()).toBeVisible();
    // Contrast status derived from records (seed: APPROVED vs engine PROCEED_WITH_CONDITIONS = Agreement).
    await expect(page.getByText("Agreement").first()).toBeVisible();
    // Decision record: decision label, actor, rationale, engine-suggested-at-time.
    await expect(page.getByText("Approved").first()).toBeVisible();
    await expect(page.getByText("Ada Admin")).toBeVisible();
    await expect(page.getByText(/Financeable with conditions/)).toBeVisible();
    await expect(page.getByText(/engine suggested Proceed with conditions/)).toBeVisible();
  });

  test("no underwriting: decision sections are absent (honest), not fabricated", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.empty}`);
    expect(await page.getByRole("heading", { name: "Why is this recommended?" }).count()).toBe(0);
    expect(await page.getByRole("heading", { name: "Decision history" }).count()).toBe(0);
  });
});

test.describe("Guided Underwriting — Increment 4 integration + discoverability + a11y (ADMIN, desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("workflow continuity: Opportunity Workspace -> Guided Underwriting -> Advanced Analysis (no dead ends)", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.active}`);
    const entry = page.getByRole("link", { name: /Guided underwriting/ });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/guided-underwriting/${M.opportunities.active}`));
    // onward to the authoritative analyzer
    await page.getByRole("link", { name: "Advanced analysis" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/analyzer/${M.opportunities.active}`));
  });

  test("honest entry: an opportunity with no underwriting shows the label but NOT a Guided Underwriting link", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${M.opportunities.empty}`);
    await expect(page.getByText("Guided underwriting")).toBeVisible(); // label present
    expect(await page.getByRole("link", { name: /Guided underwriting/ }).count(), "no link when no underwriting").toBe(0);
  });

  test("complete section order: Summary -> Missing -> Why -> History -> Supporting metrics", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    const headings = [
      "Structurability summary",
      "What information is preventing a complete answer?",
      "Why is this recommended?",
      "Decision history",
      "Supporting metrics",
    ];
    const ys: number[] = [];
    for (const name of headings) ys.push((await page.getByRole("heading", { name }).boundingBox())!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i], `${headings[i]} below ${headings[i - 1]}`).toBeGreaterThan(ys[i - 1]);
  });

  test("accessibility: single h1, section headings at level 2, main landmark, keyboard-reachable handoff", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    expect(await page.getByRole("heading", { level: 1 }).count()).toBe(1);
    await expect(page.getByRole("heading", { level: 1, name: "Guided Underwriting" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Decision history" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    const link = page.getByRole("link", { name: "Advanced analysis" }).first();
    await link.focus();
    await expect(link).toBeFocused();
  });
});

test.describe("Guided Underwriting — Increment 4 responsive (ADMIN, tablet)", () => {
  test.use({ viewport: TABLET });

  test("tablet: summary + decision history reachable, section order maintained, no horizontal overflow", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    const summaryY = (await page.getByRole("heading", { name: "Structurability summary" }).boundingBox())!.y;
    const historyY = (await page.getByRole("heading", { name: "Decision history" }).boundingBox())!.y;
    expect(summaryY).toBeLessThan(historyY); // order preserved
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("Guided Underwriting — mobile (ADMIN)", () => {
  test.use({ viewport: MOBILE });

  test("narrow viewport: summary + missing-info + decision history + analyzer link reachable, no horizontal overflow", async ({ page }) => {
    await page.goto(`/guided-underwriting/${M.opportunities.active}`);
    await expect(page.getByText("Structurable: Conditional").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "What information is preventing a complete answer?" })).toBeVisible();
    await expect(page.getByText(/Source:/).first()).toBeVisible(); // provenance readable on mobile
    await expect(page.getByRole("heading", { name: "Decision history" })).toBeVisible();
    await expect(page.getByText(/Financeable with conditions/)).toBeVisible(); // rationale readable on mobile
    await expect(page.getByRole("link", { name: "Advanced analysis" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
