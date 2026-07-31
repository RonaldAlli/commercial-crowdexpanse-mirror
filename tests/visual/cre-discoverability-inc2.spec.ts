import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { manifest, authFile, workspacePath, type Manifest } from "./_helpers";

// CRE Operating Workspace — Discoverability Remediation, Increment 2 (ruled conditional surfaces).
// Repoints C1 (Buyer Matches), C2 (Analyzer "Opportunity" back-link ×2), C4 (post-create redirect)
// to the Opportunity Workspace. C3 (Closing Dashboard) is intentionally NOT changed (its guard lives
// in cre-discoverability-inc1.spec.ts). Read-only assertions except the C1 buyer/match fixture and the
// C4 create flow, both seeded/torn down here.

const DB_URL = (() => {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.DATABASE_URL ?? "";
})();
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

let M: Manifest;
let buyerId = "", matchId = "", activePropertyId = "";
const createdOppIds: string[] = [];

test.beforeAll(async () => {
  M = manifest();
  // C1 fixture: a buyer + a match on the active deal so the matches list renders an opportunity link.
  const buyer = await prisma.buyer.create({ data: { organizationId: M.orgId, name: "INC2 Match Buyer", targetStates: ["GA"] } });
  buyerId = buyer.id;
  const match = await prisma.buyerMatch.create({ data: { organizationId: M.orgId, opportunityId: M.opportunities.active, buyerId: buyer.id, status: "NEW" } });
  matchId = match.id;
  // C4: the create form needs an existing property — reuse the active deal's property.
  const active = await prisma.opportunity.findUnique({ where: { id: M.opportunities.active }, select: { propertyId: true } });
  activePropertyId = active!.propertyId;
});

test.afterAll(async () => {
  await prisma.buyerMatch.deleteMany({ where: { id: matchId } }).catch(() => {});
  await prisma.buyer.deleteMany({ where: { id: buyerId } }).catch(() => {});
  if (createdOppIds.length) await prisma.opportunity.deleteMany({ where: { id: { in: createdOppIds } } }).catch(() => {});
  await prisma.$disconnect();
});

test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 1000 } });

test.describe("Discoverability Increment 2 — conditional surfaces repointed to the Opportunity Workspace", () => {
  test("C1: Buyer Matches → the opportunity link opens the Opportunity Workspace", async ({ page }) => {
    await page.goto("/matches");
    await expect(page.locator(`a[href="${workspacePath(M.opportunities.active)}"]`).first()).toBeVisible();
  });

  test("C2: Analyzer 'Opportunity' back-link opens the Opportunity Workspace", async ({ page }) => {
    await page.goto(`/analyzer/${M.opportunities.active}`);
    // The back affordance (btn-ghost 'Opportunity') now returns to the primary detail surface.
    const back = page.getByRole("link", { name: "Opportunity", exact: true });
    await expect(back.first()).toHaveAttribute("href", workspacePath(M.opportunities.active));
  });

  test("C4: creating a deal redirects to the Opportunity Workspace (lifecycle begins there)", async ({ page }) => {
    await page.goto(`/opportunities/new?propertyId=${activePropertyId}`);
    await page.locator('input[name="title"]').fill("INC2 Create Redirect Check");
    await Promise.all([
      page.waitForURL(new RegExp(`/opportunity-workspace/[a-z0-9]+`)),
      page.getByRole("button", { name: "Create opportunity" }).click(),
    ]);
    // Record the created opportunity id (from the landing URL) for teardown.
    const m = page.url().match(/\/opportunity-workspace\/([a-z0-9]+)/);
    if (m) createdOppIds.push(m[1]);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
