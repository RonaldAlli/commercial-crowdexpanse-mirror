import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSellerPromotion } from "../../../lib/promote-seller";
import type { ContactOutreachStatus } from "@prisma/client";

const QUALIFIED: ContactOutreachStatus = "QUALIFIED";

function base(overrides: Partial<Parameters<typeof resolveSellerPromotion>[0]> = {}) {
  return {
    canCreateOpportunity: true,
    outreachStatus: QUALIFIED,
    sellerId: "seller_1",
    propertyIds: ["prop_1"],
    ...overrides,
  };
}

// --- Visibility gates ---------------------------------------------------------

test("hidden when the user cannot create opportunities", () => {
  assert.equal(resolveSellerPromotion(base({ canCreateOpportunity: false })), null);
});

test("hidden for every non-QUALIFIED outreach status", () => {
  const others: ContactOutreachStatus[] = [
    "NEW",
    "ATTEMPTING",
    "CONTACTED",
    "RESPONDED",
    "DEAD",
    "DO_NOT_CONTACT",
  ];
  for (const status of others) {
    assert.equal(resolveSellerPromotion(base({ outreachStatus: status })), null, status);
  }
});

test("shown only when BOTH qualified AND permitted", () => {
  assert.notEqual(resolveSellerPromotion(base()), null);
});

// --- Property-count routing (an opportunity requires a property) --------------

test("0 properties → guide to add one, never a dead end", () => {
  const r = resolveSellerPromotion(base({ propertyIds: [] }));
  assert.deepEqual(r, {
    mode: "add-property",
    href: "/properties/new",
    label: "Add a property to promote",
  });
});

test("1 property → seed seller + that property", () => {
  const r = resolveSellerPromotion(base({ sellerId: "seller_1", propertyIds: ["prop_1"] }));
  assert.equal(r?.mode, "preselect-property");
  assert.equal(r?.href, "/opportunities/new?sellerId=seller_1&propertyId=prop_1");
  assert.equal(r?.label, "Promote to opportunity");
});

test("many properties → seed seller only; user picks the property", () => {
  const r = resolveSellerPromotion(base({ sellerId: "seller_9", propertyIds: ["a", "b", "c"] }));
  assert.equal(r?.mode, "choose-property");
  assert.equal(r?.href, "/opportunities/new?sellerId=seller_9");
  assert.equal(r?.label, "Promote to opportunity");
});

// --- The seed target is always the canonical create form (AC-PROMOTE-7) -------

test("every non-null promotion routes to the existing New-Opportunity form", () => {
  for (const propertyIds of [["prop_1"], ["a", "b"]]) {
    const r = resolveSellerPromotion(base({ propertyIds }));
    assert.ok(r && r.href.startsWith("/opportunities/new"), JSON.stringify(propertyIds));
  }
});

// --- Ids are URL-encoded ------------------------------------------------------

test("seller and property ids are URL-encoded into the query string", () => {
  const r = resolveSellerPromotion(base({ sellerId: "a b&c", propertyIds: ["x/y"] }));
  assert.equal(r?.href, "/opportunities/new?sellerId=a%20b%26c&propertyId=x%2Fy");
});
