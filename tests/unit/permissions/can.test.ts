import { test } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";

import { can, type Action, type Resource } from "../../../lib/permissions";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;
const WRITE: Action[] = ["CREATE", "UPDATE", "DELETE", "MANAGE"];

// Expected write-holders per resource (read is everyone else, except where noted).
const writeMatrix: Record<Resource, UserRole[]> = {
  SELLER: [ADMIN, ACQUISITIONS],
  PROPERTY: [ADMIN, ACQUISITIONS],
  OPPORTUNITY: [ADMIN, ACQUISITIONS],
  DEAL_ANALYSIS: [ADMIN, ANALYST],
  BUYER: [ADMIN, DISPOSITIONS],
  BUYER_MATCH: [ADMIN, DISPOSITIONS],
  TASK: [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS],
  NOTE: [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS],
  DOCUMENT: [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS],
  TEAM: [ADMIN],
  INVITATION: [ADMIN],
  ORGANIZATION: [ADMIN],
  OWNER: [ADMIN, ACQUISITIONS],
  OWNER_IDENTITY: [ADMIN, ACQUISITIONS],
  PROPERTY_IDENTITY: [ADMIN, ACQUISITIONS],
  REFRESH: [ADMIN, ACQUISITIONS],
};

const ALL_ROLES = [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS];

test("every write action requires a write role, per the matrix", () => {
  for (const resource of Object.keys(writeMatrix) as Resource[]) {
    const writers = writeMatrix[resource];
    for (const role of ALL_ROLES) {
      for (const action of WRITE) {
        assert.equal(
          can(role, action, resource),
          writers.includes(role),
          `${role} ${action} ${resource}`,
        );
      }
    }
  }
});

test("READ is allowed for write-holders and read-only roles alike", () => {
  // For every resource, a write-holder can read...
  assert.equal(can(ANALYST, "READ", "DEAL_ANALYSIS"), true); // write-holder
  assert.equal(can(ACQUISITIONS, "READ", "DEAL_ANALYSIS"), true); // read-only role
  assert.equal(can(DISPOSITIONS, "READ", "SELLER"), true); // read-only role
  assert.equal(can(ANALYST, "READ", "BUYER"), true); // read-only role
});

test("ORGANIZATION is ADMIN-only for management, readable by no one else", () => {
  assert.equal(can(ADMIN, "MANAGE", "ORGANIZATION"), true);
  for (const role of [ACQUISITIONS, ANALYST, DISPOSITIONS]) {
    assert.equal(can(role, "MANAGE", "ORGANIZATION"), false);
    assert.equal(can(role, "READ", "ORGANIZATION"), false); // no read role configured
  }
});

test("TEAM/INVITATION management is ADMIN-only", () => {
  for (const resource of ["TEAM", "INVITATION"] as Resource[]) {
    assert.equal(can(ADMIN, "MANAGE", resource), true);
    assert.equal(can(ACQUISITIONS, "MANAGE", resource), false);
  }
});

test("TASK/NOTE/DOCUMENT are writable by all roles", () => {
  for (const resource of ["TASK", "NOTE", "DOCUMENT"] as Resource[]) {
    for (const role of ALL_ROLES) {
      assert.equal(can(role, "CREATE", resource), true);
    }
  }
});
