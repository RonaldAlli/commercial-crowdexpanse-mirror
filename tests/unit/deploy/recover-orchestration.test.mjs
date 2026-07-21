import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

import { runRecovery } from "../../../scripts/deploy/recover.mjs";
import { ownerAlive } from "../../../scripts/deploy/ops-real.mjs";

// D26 — runRecovery orchestration over INJECTED ops (the real host ops are exercised by the staging
// kill-drill). Proves: the right action per phase, idempotency, interrupted-recovery reporting, and that a
// LIVE deploy's lock is never touched. assessLock's decision table is covered exhaustively in recover.test.

const NOW = 2_000_000_000_000;
function metaAt(phase, over = {}) {
  const order = ["PRECHECK", "BUILD", "VERIFY_BUILD", "SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE", "COMPLETE"];
  return { pid: 42, host: "h", startedAt: new Date(NOW - 5000).toISOString(), stamp: "S",
    release: "releases/new", previous: "releases/old",
    events: order.slice(0, order.indexOf(phase) + 1).map((p) => ({ phase: p, at: "t" })), ...over };
}
function fakeOps({ meta, facts, throwOn }) {
  const calls = [], reports = [];
  const ops = {
    log: () => {}, now: () => NOW,
    readLock: async () => meta,
    gatherFacts: async () => ({ ownerAlive: false, now: NOW, nextTarget: null, maxAgeMs: 1_800_000, ...facts }),
    clean: async () => { calls.push("clean"); if (throwOn === "clean") throw new Error("clean failed"); },
    rollback: async () => { calls.push("rollback"); if (throwOn === "rollback") throw new Error("rollback failed"); },
    finalize: async () => { calls.push("finalize"); },
    writeReport: async (r) => { reports.push(r); },
  };
  return { ops, calls, reports };
}

test("pre-swap stale (BUILD) → CLEAN executed + report written", async () => {
  const { ops, calls, reports } = fakeOps({ meta: metaAt("BUILD") });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "CLEAN"); assert.deepEqual(calls, ["clean"]); assert.equal(r.ok, true);
  assert.equal(reports.length, 1); assert.equal(reports[0].recommendation, "CLEAN");
  assert.deepEqual(reports[0].actions, ["clean:dropped-lock+deleted-partial-release"]);
});

test("post-swap stale (SWAP) with .next→new release → ROLLBACK executed", async () => {
  const { ops, calls } = fakeOps({ meta: metaAt("SWAP"), facts: { nextTarget: "releases/new" } });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "ROLLBACK"); assert.deepEqual(calls, ["rollback"]);
});

test("post-swap stale (RESTART) with .next NOT new → CLEAN (swap didn't land)", async () => {
  const { ops, calls } = fakeOps({ meta: metaAt("RESTART"), facts: { nextTarget: "releases/old" } });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "CLEAN"); assert.deepEqual(calls, ["clean"]);
});

test("COMPLETE stale → FINALIZE executed", async () => {
  const { ops, calls } = fakeOps({ meta: metaAt("COMPLETE"), facts: { nextTarget: "releases/new" } });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "FINALIZE"); assert.deepEqual(calls, ["finalize"]);
});

test("ACTIVE (owner alive) → REFUSE_BUSY: NO destructive action taken", async () => {
  const { ops, calls } = fakeOps({ meta: metaAt("BUILD"), facts: { ownerAlive: true } });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "REFUSE_BUSY"); assert.deepEqual(calls, []);
});

test("idempotency: no lock → NONE, no action, still writes a (no-op) report", async () => {
  const { ops, calls, reports } = fakeOps({ meta: null });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "NONE"); assert.deepEqual(calls, []); assert.equal(reports.length, 1);
});

test("corrupt lock → MANUAL: no destructive action", async () => {
  const { ops, calls } = fakeOps({ meta: { __corrupt: true } });
  const r = await runRecovery({}, ops);
  assert.equal(r.recommendation, "MANUAL"); assert.deepEqual(calls, []);
});

test("interrupted recovery: a failing action is captured (ok:false) and reported, not swallowed", async () => {
  const { ops, reports } = fakeOps({ meta: metaAt("SWAP"), facts: { nextTarget: "releases/new" }, throwOn: "rollback" });
  const r = await runRecovery({}, ops);
  assert.equal(r.ok, false); assert.match(r.error, /rollback failed/);
  assert.equal(reports[0].ok, false); // report still written (auditable)
});

test("report content: originalLock + observed + decision + timestamps", async () => {
  const { ops, reports } = fakeOps({ meta: metaAt("BUILD") });
  await runRecovery({}, ops);
  const rep = reports[0];
  for (const k of ["startedAt", "endedAt", "originalLock", "observed", "classification", "recommendation", "reason", "actions", "ok"]) assert.ok(k in rep, `report has ${k}`);
  assert.equal(rep.originalLock.stamp, "S");
});

test("ownerAlive guard: wrong host → false; null/corrupt → false (PID-reuse safety)", () => {
  assert.equal(ownerAlive({ pid: process.pid, host: "some-other-host" }), false);
  assert.equal(ownerAlive(null), false);
  assert.equal(ownerAlive({ __corrupt: true }), false);
  assert.equal(ownerAlive({ pid: 2147483000, host: os.hostname() }), false); // improbable/dead PID → no /proc entry
});
