import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, type Manifest } from "./_helpers";

// CRE Operating Workspace — Revenue Workspace, Milestone 1, Increment 3 (per-deal Revenue).
// The Revenue section INSIDE the Opportunity Workspace: Projected / Expected / Realized clearly separated
// (Financial Truthfulness), an EVIDENCE-BASED Revenue Timeline from ACTIVE authority — recorded ActivityLog
// events + the active AssignmentRecord (Active Evidence; never the dormant pipeline facts) — and Revenue
// Traceability (Realized → assignment / Closing Workspace). Seeds one isolated executed-assignment deal + one
// recorded escrow event, and tears them down.

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
let oppId = "", propId = "";
const EXPECTED = 25000, REALIZED = 27500;

test.beforeAll(async () => {
  M = manifest();
  const prop = await prisma.property.create({ data: { organizationId: M.orgId, name: "INC3 Revenue Asset", assetType: "MULTIFAMILY", addressLine1: "3 Ledger Ave", city: "Atlanta", state: "GA" } });
  propId = prop.id;
  const opp = await prisma.opportunity.create({
    data: { organizationId: M.orgId, propertyId: prop.id, title: "INC3 Per-deal Revenue", stage: "PAID", assignmentFeeUsd: EXPECTED, acquisitionChannel: "COMMERCIAL_BROKER" },
  });
  oppId = opp.id;
  await prisma.assignmentRecord.create({
    data: { organizationId: M.orgId, opportunityId: opp.id, status: "EXECUTED", executedFeeUsdSnapshot: REALIZED, resolvedAt: new Date("2026-07-20T00:00:00.000Z") },
  });
  // One recorded ActivityLog event → the Escrow-activity timeline step should derive from it (Active Evidence).
  await prisma.activityLog.create({
    data: { organizationId: M.orgId, opportunityId: opp.id, eventType: "escrow.opened", eventLabel: "Escrow opened", createdAt: new Date("2026-07-05T00:00:00.000Z") },
  });
});

test.afterAll(async () => {
  await prisma.activityLog.deleteMany({ where: { opportunityId: oppId } }).catch(() => {});
  await prisma.opportunity.deleteMany({ where: { id: oppId } }).catch(() => {});
  await prisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Revenue Workspace — Increment 3 per-deal Revenue (ADMIN, desktop)", () => {
  test("Revenue section shows the three separated concepts with the right values", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${oppId}`);
    const section = page.getByRole("region", { name: "Revenue" });
    await expect(section).toBeVisible();
    for (const tier of ["Projected", "Expected", "Realized"]) {
      await expect(section.getByText(tier, { exact: true })).toBeVisible();
    }
    await expect(section.getByText("$25,000")).toBeVisible(); // Expected (contracted fee)
    await expect(section.getByText("$27,500")).toBeVisible(); // Realized (executed snapshot)
    await expect(section.getByText("Not started")).toBeVisible(); // Projected — no underwriting
  });

  test("Revenue Traceability: Realized links to the assignment evidence (Closing Workspace)", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${oppId}`);
    const section = page.getByRole("region", { name: "Revenue" });
    await expect(section.getByRole("link", { name: /View assignment evidence/ })).toHaveAttribute("href", `/closing-workspace/${oppId}`);
  });

  test("Active Evidence timeline: realized + escrow occurred from real records; fact-less steps honestly pending", async ({ page }) => {
    await page.goto(`/opportunity-workspace/${oppId}`);
    const section = page.getByRole("region", { name: "Revenue" });
    await expect(section.getByText("Revenue timeline")).toBeVisible();
    // Revenue realized reflects the executed assignment date.
    await expect(section.locator("li", { hasText: "Revenue realized" })).toContainText("2026-07-20");
    // Escrow activity derives from the recorded ActivityLog escrow.opened event.
    await expect(section.locator("li", { hasText: "Escrow activity" })).toContainText("2026-07-05");
    // No financing.* event and no contract event → those steps are honestly pending.
    await expect(section.locator("li", { hasText: "Financing activity" })).toContainText("pending");
    await expect(section.locator("li", { hasText: "Contract executed" })).toContainText("pending");
  });
});
