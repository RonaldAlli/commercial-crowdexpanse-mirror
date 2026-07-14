import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

import { can } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;

test("REFRESH write (run a refresh) is ADMIN + ACQUISITIONS only", () => {
  for (const role of [ADMIN, ACQUISITIONS]) assert.equal(can(role, "CREATE", "REFRESH"), true, `${role} can run`);
  for (const role of [ANALYST, DISPOSITIONS]) assert.equal(can(role, "CREATE", "REFRESH"), false, `${role} cannot run`);
});

test("REFRESH read (view the audit trail) is allowed for every role", () => {
  for (const role of [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS]) {
    assert.equal(can(role, "READ", "REFRESH"), true, `${role} can read`);
  }
});
