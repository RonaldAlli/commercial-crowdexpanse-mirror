import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, oppPath, workspacePath, type Manifest } from "./_helpers";

// CRE Operating Workspace — Discoverability Remediation, Increment 1 (core deal-opening repoints).
// Governing rule / Operator Entry Principle: opening a deal lands on the Opportunity Workspace
// (the one primary landing page); the Closing Console stays the EXECUTION surface reached from it.
// This spec verifies each repointed entry point now targets /opportunity-workspace/[id], and guards
// that the execution-oriented Closing Dashboard (C3, KEEP CONSOLE) still targets /opportunities/[id].
// Read-only: asserts href targets + navigation; no mutation of app state (the task fixture is seeded
// directly and torn down).

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
let taskId = "";

test.beforeAll(async () => {
  M = manifest();
  // Tasks are not part of the base fixture set — seed one linked to the active deal so the tasks
  // surfaces render an opportunity link to verify. Torn down in afterAll.
  const task = await prisma.task.create({
    data: { organizationId: M.orgId, opportunityId: M.opportunities.active, title: "INC1 discoverability task fixture", status: "BACKLOG" },
  });
  taskId = task.id;
});
test.afterAll(async () => {
  await prisma.task.deleteMany({ where: { id: taskId } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Discoverability Increment 1 — deal-opening repoints to the Opportunity Workspace", () => {
  test("Pipeline list: the row title link opens the Opportunity Workspace (and click lands there)", async ({ page }) => {
    await page.goto("/opportunities?view=list");
    const link = page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first();
    await expect(link).toBeVisible();
    // The row must NOT link the title straight to the console any more.
    await expect(page.locator(`a[href="${oppPath(M.opportunities.active)}"]`)).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/opportunity-workspace/${M.opportunities.active}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Pipeline board: the card title link opens the Opportunity Workspace", async ({ page }) => {
    await page.goto("/opportunities?view=board");
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });

  test("Dashboard 'Recent opportunities' links open the Opportunity Workspace", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });

  test("Global search results open the Opportunity Workspace", async ({ page }) => {
    await page.goto("/search?q=Oakleaf");
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });

  test("Tasks list: the linked opportunity opens the Opportunity Workspace", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });

  test("Task detail: the linked opportunity opens the Opportunity Workspace", async ({ page }) => {
    await page.goto(`/tasks/${taskId}`);
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });
});

test.describe("Discoverability Increment 1 — execution surface preserved (C3 guard)", () => {
  test("Closing Dashboard rows STILL open the Closing Console (execution intent kept)", async ({ page }) => {
    await page.goto("/closing");
    // C3 ruling: KEEP CONSOLE. The transaction dashboard must still deep-link to /opportunities/[id].
    await expect(page.locator(`a[href="${oppPath(M.opportunities.active)}"]`).first()).toBeVisible();
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`)).toHaveCount(0);
  });
});
