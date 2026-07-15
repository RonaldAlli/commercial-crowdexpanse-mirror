import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

import { can } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;

test("PROPERTY_IDENTITY write is ADMIN + ACQUISITIONS only (high-risk, mirrors OWNER_IDENTITY)", () => {
  for (const role of [ADMIN, ACQUISITIONS]) assert.equal(can(role, "MANAGE", "PROPERTY_IDENTITY"), true, `${role} can resolve identity`);
  for (const role of [ANALYST, DISPOSITIONS]) assert.equal(can(role, "MANAGE", "PROPERTY_IDENTITY"), false, `${role} cannot resolve identity`);
});

test("PROPERTY_IDENTITY read is ADMIN + ACQUISITIONS only — the identity-review surface (Commit 2c-ii)", () => {
  // Identity review (candidate queue + resolution audit) is governance, not operational
  // reporting, so ANALYST/DISPOSITIONS are excluded from read as well as write.
  for (const role of [ADMIN, ACQUISITIONS]) assert.equal(can(role, "READ", "PROPERTY_IDENTITY"), true, `${role} may view identity review`);
  for (const role of [ANALYST, DISPOSITIONS]) assert.equal(can(role, "READ", "PROPERTY_IDENTITY"), false, `${role} may not view identity review`);
});

test("PROPERTY (ordinary maintenance) stays distinct from PROPERTY_IDENTITY", () => {
  // Recording an anchor is ordinary PROPERTY write (ANALYST/DISPOSITIONS read it);
  // identity resolution is PROPERTY_IDENTITY (no read tier). The two must not collapse.
  assert.equal(can(ANALYST, "READ", "PROPERTY"), true);
  assert.equal(can(ANALYST, "READ", "PROPERTY_IDENTITY"), false);
});
