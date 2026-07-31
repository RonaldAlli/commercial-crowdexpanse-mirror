import { test, expect } from "@playwright/test";

import { manifest, authFile, oppPath, workspacePath, type Manifest } from "./_helpers";

// CRE Operating Workspace — Discoverability Remediation, Increment 3.
// Adds a direct "Open Closing Console" EXECUTION exit to the Opportunity Workspace (Workflow Intent
// Preservation: readiness vs execution are distinct, explicitly-labeled destinations). The Closing
// Console page itself is NOT modified. Guided Underwriting and Closing Workspace exits are preserved
// (Operator Entry Principle). Read-only.

let M: Manifest;
test.beforeAll(() => { M = manifest(); });
test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Discoverability Increment 3 — Opportunity Workspace → Closing Console affordance", () => {
  test("the workspace offers a direct one-hop 'Open Closing Console' execution exit", async ({ page }) => {
    await page.goto(workspacePath(M.opportunities.active));
    const console = page.getByRole("link", { name: "Open Closing Console →" });
    await expect(console).toHaveAttribute("href", oppPath(M.opportunities.active));
  });

  test("readiness and execution exits coexist and remain distinct (Closing Workspace preserved)", async ({ page }) => {
    await page.goto(workspacePath(M.opportunities.active));
    await expect(page.getByRole("link", { name: "Open Closing Workspace →" })).toHaveAttribute("href", `/closing-workspace/${M.opportunities.active}`);
    await expect(page.getByRole("link", { name: "Open Closing Console →" })).toHaveAttribute("href", oppPath(M.opportunities.active));
  });

  test("Guided Underwriting remains reachable (Operator Entry Principle preserved)", async ({ page }) => {
    await page.goto(workspacePath(M.opportunities.active));
    // active has an active underwriting scenario in the seed → the crosslink is a live link.
    await expect(page.locator(`a[href="/guided-underwriting/${M.opportunities.active}"]`).first()).toBeVisible();
  });

  test("clicking 'Open Closing Console' navigates to the execution surface", async ({ page }) => {
    await page.goto(workspacePath(M.opportunities.active));
    await page.getByRole("link", { name: "Open Closing Console →" }).click();
    await expect(page).toHaveURL(new RegExp(`/opportunities/${M.opportunities.active}$`));
  });
});
