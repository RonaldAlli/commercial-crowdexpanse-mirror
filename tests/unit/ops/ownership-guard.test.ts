import { test } from "node:test";
import assert from "node:assert/strict";

import { findForeignOwned, SOURCE_ROOTS, ALLOWED_FOREIGN_PREFIXES } from "../../../scripts/lib/ownership-guard.mjs";

const DEPLOY_UID = 1000;

test("all-deploy-owned → no offenders", () => {
  const entries = [
    { path: "app/page.tsx", uid: DEPLOY_UID },
    { path: "lib/x.ts", uid: DEPLOY_UID },
    { path: "prisma/migrations/m/migration.sql", uid: DEPLOY_UID },
  ];
  assert.deepEqual(findForeignOwned(entries, DEPLOY_UID), []);
});

test("root-owned paths are flagged (D23 recurrence)", () => {
  const entries = [
    { path: "app/(workspace)/settings/imports/actions.ts", uid: 0 },
    { path: "prisma/migrations/20260717134500_add_opportunity_diligence", uid: 0 },
    { path: "lib/ok.ts", uid: DEPLOY_UID },
  ];
  assert.deepEqual(findForeignOwned(entries, DEPLOY_UID), [
    "app/(workspace)/settings/imports/actions.ts",
    "prisma/migrations/20260717134500_add_opportunity_diligence",
  ]);
});

test("output is sorted deterministically", () => {
  const entries = [
    { path: "zeta", uid: 0 },
    { path: "alpha", uid: 0 },
  ];
  assert.deepEqual(findForeignOwned(entries, DEPLOY_UID), ["alpha", "zeta"]);
});

test("allowlist prefix excludes an intentional external path (exact + subtree)", () => {
  const entries = [
    { path: "app/external", uid: 0 },
    { path: "app/external/child.ts", uid: 0 },
    { path: "app/real-offender.ts", uid: 0 },
  ];
  const offenders = findForeignOwned(entries, DEPLOY_UID, ["app/external"]);
  assert.deepEqual(offenders, ["app/real-offender.ts"]);
});

test("a prefix must not match a sibling by string-prefix accident", () => {
  // "app/ext" must NOT allow-list "app/extra.ts" (only "app/ext" itself or "app/ext/…").
  const offenders = findForeignOwned([{ path: "app/extra.ts", uid: 0 }], DEPLOY_UID, ["app/ext"]);
  assert.deepEqual(offenders, ["app/extra.ts"]);
});

test("the guard is configured read-only (no default allowlist, real source roots)", () => {
  assert.deepEqual(ALLOWED_FOREIGN_PREFIXES, []);
  assert.ok(SOURCE_ROOTS.includes("app") && SOURCE_ROOTS.includes("prisma/migrations"));
});
