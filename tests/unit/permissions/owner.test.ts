import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

import { can, canMergeOwners } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;

test("canMergeOwners is ADMIN-only (stricter than OWNER_IDENTITY manage)", () => {
  assert.equal(canMergeOwners(ADMIN), true);
  for (const role of [ACQUISITIONS, ANALYST, DISPOSITIONS]) {
    assert.equal(canMergeOwners(role), false);
  }
});

test("OWNER: acquisitions + admin write; analyst + dispositions read-only", () => {
  for (const role of [ADMIN, ACQUISITIONS]) {
    assert.equal(can(role, "CREATE", "OWNER"), true);
    assert.equal(can(role, "UPDATE", "OWNER"), true);
  }
  for (const role of [ANALYST, DISPOSITIONS]) {
    assert.equal(can(role, "READ", "OWNER"), true);
    assert.equal(can(role, "CREATE", "OWNER"), false);
    assert.equal(can(role, "UPDATE", "OWNER"), false);
    assert.equal(can(role, "DELETE", "OWNER"), false);
  }
});

test("OWNER_IDENTITY: only admin + acquisitions may MANAGE; no read-only tier", () => {
  assert.equal(can(ADMIN, "MANAGE", "OWNER_IDENTITY"), true);
  assert.equal(can(ACQUISITIONS, "MANAGE", "OWNER_IDENTITY"), true);
  assert.equal(can(ANALYST, "MANAGE", "OWNER_IDENTITY"), false);
  assert.equal(can(DISPOSITIONS, "MANAGE", "OWNER_IDENTITY"), false);
  // No read tier — reading identity resolution requires the manage capability.
  assert.equal(can(ANALYST, "READ", "OWNER_IDENTITY"), false);
  assert.equal(can(DISPOSITIONS, "READ", "OWNER_IDENTITY"), false);
});
