import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

import { can } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;

test("PROPERTY_IDENTITY write is ADMIN + ACQUISITIONS only (high-risk, mirrors OWNER_IDENTITY)", () => {
  for (const role of [ADMIN, ACQUISITIONS]) assert.equal(can(role, "MANAGE", "PROPERTY_IDENTITY"), true, `${role} can resolve identity`);
  for (const role of [ANALYST, DISPOSITIONS]) assert.equal(can(role, "MANAGE", "PROPERTY_IDENTITY"), false, `${role} cannot resolve identity`);
});

test("PROPERTY_IDENTITY has NO read-only tier (identity resolution is not a viewer surface)", () => {
  for (const role of [ANALYST, DISPOSITIONS]) assert.equal(can(role, "READ", "PROPERTY_IDENTITY"), false, `${role} has no identity read tier`);
  for (const role of [ADMIN, ACQUISITIONS]) assert.equal(can(role, "READ", "PROPERTY_IDENTITY"), true);
});

test("PROPERTY (ordinary maintenance) stays distinct from PROPERTY_IDENTITY", () => {
  // Recording an anchor is ordinary PROPERTY write (ANALYST/DISPOSITIONS read it);
  // identity resolution is PROPERTY_IDENTITY (no read tier). The two must not collapse.
  assert.equal(can(ANALYST, "READ", "PROPERTY"), true);
  assert.equal(can(ANALYST, "READ", "PROPERTY_IDENTITY"), false);
});
