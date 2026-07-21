import { test } from "node:test";
import assert from "node:assert/strict";

import { assessLock, lastPhase, PHASES } from "../../../scripts/deploy/recover.mjs";

// D26 — the assessor is PURE + DETERMINISTIC: same (meta, facts) → same conclusion. Separates observed
// state from the recovery recommendation. These tests pin the decision table exhaustively.

const NOW = 1_000_000_000_000;
function meta(phase, over = {}) {
  const events = PHASES.slice(0, PHASES.indexOf(phase) + 1).map((p) => ({ phase: p, at: "t" }));
  return { pid: 111, host: "h", startedAt: new Date(NOW - 5000).toISOString(), stamp: "S", release: "releases/new", previous: "releases/old", events, ...over };
}
const facts = (o = {}) => ({ ownerAlive: false, now: NOW, nextTarget: null, maxAgeMs: 1_800_000, ...o });

test("determinism: identical inputs → identical output (deep-equal across repeated calls)", () => {
  const m = meta("SWAP"), f = facts({ nextTarget: "releases/new" });
  const a = assessLock(m, f), b = assessLock(m, f), c = assessLock(structuredClone(m), { ...f });
  assert.deepEqual(a, b); assert.deepEqual(a, c);
});

test("NONE: no lock → nothing to recover", () => {
  const r = assessLock(null, facts());
  assert.equal(r.classification, "NONE"); assert.equal(r.recommendation, "NONE");
});

test("UNKNOWN: corrupt metadata → MANUAL (fail-closed)", () => {
  const r = assessLock({ __corrupt: true }, facts());
  assert.equal(r.classification, "UNKNOWN"); assert.equal(r.recommendation, "MANUAL");
});

test("ACTIVE: owner alive + within max age → REFUSE_BUSY (never mistaken for stale)", () => {
  const r = assessLock(meta("BUILD"), facts({ ownerAlive: true }));
  assert.equal(r.classification, "ACTIVE"); assert.equal(r.recommendation, "REFUSE_BUSY");
});

test("ACTIVE→STALE: owner alive but OLDER than maxAge → STALE (age guard)", () => {
  const r = assessLock(meta("BUILD"), facts({ ownerAlive: true, maxAgeMs: 1000 }));
  assert.equal(r.classification, "STALE");
});

for (const phase of ["PRECHECK", "BUILD", "VERIFY_BUILD"]) {
  test(`STALE pre-swap (${phase}) → CLEAN (live untouched, no rollback)`, () => {
    const r = assessLock(meta(phase), facts({ ownerAlive: false }));
    assert.equal(r.classification, "STALE"); assert.equal(r.recommendation, "CLEAN");
  });
}

for (const phase of ["SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE"]) {
  test(`STALE post-swap (${phase}) with .next→new release → ROLLBACK`, () => {
    const r = assessLock(meta(phase), facts({ ownerAlive: false, nextTarget: "releases/new" }));
    assert.equal(r.recommendation, "ROLLBACK");
  });
  test(`STALE post-swap (${phase}) with .next NOT the new release → CLEAN (swap didn't land)`, () => {
    const r = assessLock(meta(phase), facts({ ownerAlive: false, nextTarget: "releases/old" }));
    assert.equal(r.recommendation, "CLEAN");
  });
}

test("STALE at COMPLETE → FINALIZE (deploy had succeeded)", () => {
  const r = assessLock(meta("COMPLETE"), facts({ ownerAlive: false, nextTarget: "releases/new" }));
  assert.equal(r.recommendation, "FINALIZE");
});

test("UNKNOWN: lock with no event journal + owner dead → MANUAL", () => {
  const r = assessLock(meta("BUILD", { events: [] }), facts({ ownerAlive: false }));
  assert.equal(r.classification, "UNKNOWN"); assert.equal(r.recommendation, "MANUAL");
});

test("lastPhase reads the append-only journal tail", () => {
  assert.equal(lastPhase(meta("VERIFY_RUNTIME")), "VERIFY_RUNTIME");
  assert.equal(lastPhase({ events: [] }), null);
  assert.equal(lastPhase(null), null);
});
