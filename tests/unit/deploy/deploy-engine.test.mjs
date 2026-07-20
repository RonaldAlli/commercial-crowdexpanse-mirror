import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runDeploy } from "../../../scripts/deploy/deploy-engine.mjs";

// Sandbox: a fake app dir with releases/prev (BUILD_PREV) and .next -> releases/prev. The injected ops
// manipulate REAL symlinks so the tests prove the actual atomic swap + rollback mechanics — no host.
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d25-"));
  fs.mkdirSync(path.join(dir, "releases", "prev"), { recursive: true });
  fs.writeFileSync(path.join(dir, "releases", "prev", "BUILD_ID"), "BUILD_PREV");
  fs.symlinkSync("releases/prev", path.join(dir, ".next")); // relative symlink, like production
  return dir;
}
function makeOps(dir, { failAt, requestedId = "COMMIT_A" } = {}) {
  const link = path.join(dir, ".next");
  let previousTarget = null, clock = 0, builds = 0;
  const history = [], restarts = [];
  const target = () => { try { return fs.readlinkSync(link); } catch { return null; } };
  const servedBuildId = () => { try { return fs.readFileSync(path.join(link, "BUILD_ID"), "utf8").trim(); } catch { return null; } };
  const markerOf = (rel) => { try { return fs.readFileSync(path.join(dir, rel, ".release-id"), "utf8").trim(); } catch { return null; } };
  const atomicSymlink = (t) => { const tmp = link + ".tmp"; try { fs.unlinkSync(tmp); } catch {} fs.symlinkSync(t, tmp); fs.renameSync(tmp, link); }; // rename(2) = atomic
  const gate = (s) => { if (failAt === s) throw new Error(`${s} failed (injected)`); };
  const ops = {
    log: () => {},
    now: () => ++clock, // deterministic monotonic clock (no Date.now in tests)
    precheck: async (ctx) => {
      previousTarget = target();
      ctx.previousTarget = previousTarget;
      ctx.requestedReleaseId = requestedId;
      ctx.activeReleaseId = previousTarget ? markerOf(previousTarget) : null;
      ctx.activeBuildId = servedBuildId();
      gate("precheck");
      return { summary: `prev=${previousTarget} req=${requestedId} active=${ctx.activeReleaseId}` };
    },
    build: async (ctx, { dryRun }) => {
      builds++;
      const rel = "releases/new"; const abs = path.join(dir, rel);
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(path.join(abs, "BUILD_ID"), "BUILD_NEW");
      fs.writeFileSync(path.join(abs, ".release-id"), ctx.requestedReleaseId);
      const manifest = { releaseId: ctx.requestedReleaseId, buildId: "BUILD_NEW", commit: "COMMITFULL",
        builtAt: `t${clock}`, nodeVersion: process.version, schemaVersion: "0001_init", stamp: "new", artifacts: ["BUILD_ID"] };
      fs.writeFileSync(path.join(abs, "release.json"), JSON.stringify(manifest));
      gate("build");
      return { releaseDir: rel, absDir: abs, dryRun, manifest };
    },
    assertSingleActive: async () => {
      let s = null; try { s = fs.lstatSync(link); } catch { s = null; }
      if (s && !s.isSymbolicLink()) throw new Error("single-active invariant: .next is a real directory");
      const t = target();
      if (t && !fs.existsSync(path.join(dir, t, "BUILD_ID"))) throw new Error("single-active invariant: active target has no BUILD_ID");
      return { summary: `active=${t ?? "(none)"}` };
    },
    verifyBuild: async (_c, built) => { gate("verifyBuild"); const id = fs.readFileSync(path.join(built.absDir, "BUILD_ID"), "utf8").trim(); if (!id) throw new Error("no BUILD_ID"); return { buildId: id }; },
    validateSwapTarget: async (_c, built) => { if (!fs.existsSync(built.absDir)) throw new Error("swap target missing"); },
    validateRollbackTarget: async (ctx) => { if (!ctx.previousTarget || !fs.existsSync(path.join(dir, ctx.previousTarget))) throw new Error("no readable previous release"); },
    swap: async (_c, built) => { atomicSymlink(built.releaseDir); gate("swap"); },
    restart: async () => { restarts.push(servedBuildId()); gate("restart"); },
    verifyRuntime: async (_c, buildId) => { gate("verifyRuntime"); if (servedBuildId() !== buildId) throw new Error("serving wrong build"); },
    smoke: async () => { gate("smoke"); },
    retain: async () => {},
    rollback: async (ctx) => { atomicSymlink(ctx.previousTarget); restarts.push(`ROLLBACK:${servedBuildId()}`); }, // repoint prev + "restart"
    releaseLock: async () => {},
    persistTrace: async (_c, record) => { history.push(record); },
  };
  return { ops, _: { target, servedBuildId, restarts, history, builds: () => builds } };
}
const clean = (d) => fs.rmSync(d, { recursive: true, force: true });

test("happy path: builds, atomically swaps, restarts, completes → serving the new release", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir);
  const r = await runDeploy({ config: { stamp: "S1" } }, ops);
  assert.equal(r.ok, true); assert.equal(r.rolledBack, false); assert.ok(!r.noop);
  assert.equal(_.target(), "releases/new"); assert.equal(_.servedBuildId(), "BUILD_NEW");
  assert.equal(r.buildId, "BUILD_NEW");
  clean(dir);
});

test("MANDATORY forced-failure: a restart failure AFTER swap auto-rolls-back to the previous release", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { failAt: "restart" });
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, false);
  assert.equal(r.rolledBack, true, "engine rolled back automatically");
  assert.equal(_.target(), "releases/prev", "symlink restored to previous release");
  assert.equal(_.servedBuildId(), "BUILD_PREV", "BUILD_ID restored");
  assert.ok(_.restarts.some((x) => x === "ROLLBACK:BUILD_PREV"), "process restarted on the previous release (no manual intervention)");
  const states = r.trace.map((t) => `${t.state}:${t.status}`);
  assert.ok(states.includes("SWAP:ok") && states.includes("RESTART:error") && states.includes("ROLLBACK:done"), "trace shows swap→restart-fail→rollback");
  clean(dir);
});

test("DE-3 ordering: a PRECHECK failure aborts BEFORE build (no side-effecting build runs)", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { failAt: "precheck" });
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, false); assert.equal(r.rolledBack, false, "nothing to roll back — failed before swap");
  assert.equal(_.builds(), 0, "BUILD never ran (target validation is a PRECHECK criterion)");
  assert.equal(_.target(), "releases/prev", "live symlink untouched");
  assert.equal(_.history.length, 0, "no history persisted — a refused run leaves ZERO residue");
  clean(dir);
});

test("forced-failure at SMOKE (after swap+restart) also auto-rolls-back", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { failAt: "smoke" });
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, false); assert.equal(r.rolledBack, true);
  assert.equal(_.target(), "releases/prev"); assert.equal(_.servedBuildId(), "BUILD_PREV");
  clean(dir);
});

test("failure BEFORE swap (verifyBuild) leaves the live release untouched — nothing to roll back", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { failAt: "verifyBuild" });
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, false); assert.equal(r.rolledBack, false);
  assert.equal(_.target(), "releases/prev", "live symlink never changed");
  assert.equal(_.servedBuildId(), "BUILD_PREV");
  clean(dir);
});

test("--dry-run validates build/targets but never swaps the live symlink", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir);
  const r = await runDeploy({}, ops, { dryRun: true });
  assert.equal(r.ok, true); assert.equal(r.dryRun, true);
  assert.equal(_.target(), "releases/prev", "live symlink unchanged by dry-run");
  assert.equal(_.servedBuildId(), "BUILD_PREV");
  assert.deepEqual(_.restarts, [], "no restart during dry-run");
  clean(dir);
});

test("IDEMPOTENCY: re-running deploy at the SAME release id is a no-op (no rebuild, no swap, success)", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { requestedId: "COMMIT_A" });
  const r1 = await runDeploy({}, ops);                 // fresh deploy of COMMIT_A
  assert.equal(r1.ok, true); assert.ok(!r1.noop);
  assert.equal(_.target(), "releases/new"); assert.equal(_.builds(), 1);
  const restartsAfterFirst = _.restarts.length;

  const r2 = await runDeploy({}, ops);                 // run again, still COMMIT_A → active
  assert.equal(r2.ok, true);
  assert.equal(r2.noop, true, "second run detects the release is already active");
  assert.equal(_.builds(), 1, "no rebuild on the no-op run");
  assert.equal(_.target(), "releases/new", "symlink unchanged");
  assert.equal(_.restarts.length, restartsAfterFirst, "no restart on the no-op run");
  assert.ok(r2.trace.some((t) => t.state === "ALREADY_ACTIVE" && t.status === "noop"), "trace records ALREADY_ACTIVE");
  clean(dir);
});

test("IDEMPOTENCY: --force redeploys even when the release id is already active", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir, { requestedId: "COMMIT_A" });
  await runDeploy({}, ops);
  const r2 = await runDeploy({}, ops, { force: true });
  assert.equal(r2.ok, true); assert.ok(!r2.noop, "force bypasses the no-op");
  assert.equal(_.builds(), 2, "force rebuilds");
  clean(dir);
});

test("IDEMPOTENCY: deploy --dry-run can be re-run safely (never swaps, no no-op short-circuit)", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir);
  const a = await runDeploy({}, ops, { dryRun: true });
  const b = await runDeploy({}, ops, { dryRun: true });
  assert.equal(a.ok && b.ok, true); assert.equal(a.dryRun && b.dryRun, true);
  assert.equal(_.target(), "releases/prev", "live symlink unchanged by repeated dry-runs");
  assert.deepEqual(_.restarts, [], "no restart across dry-runs");
  clean(dir);
});

test("MANIFEST: build writes release.json with releaseId/buildId/commit/builtAt/nodeVersion/schemaVersion/artifacts", async () => {
  const dir = sandbox(); const { ops } = makeOps(dir, { requestedId: "COMMIT_A" });
  const r = await runDeploy({ config: { stamp: "S1" } }, ops);
  assert.equal(r.ok, true);
  const m = JSON.parse(fs.readFileSync(path.join(dir, "releases", "new", "release.json"), "utf8"));
  for (const k of ["releaseId", "buildId", "commit", "builtAt", "nodeVersion", "schemaVersion", "artifacts"]) assert.ok(k in m, `manifest has ${k}`);
  assert.equal(m.releaseId, "COMMIT_A"); assert.equal(m.buildId, "BUILD_NEW");
  assert.ok(Array.isArray(m.artifacts) && m.artifacts.includes("BUILD_ID"));
  clean(dir);
});

test("INVARIANT: swap is refused PRE-SWAP when .next is a real directory (two competing 'current' releases)", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir);
  // Corrupt the model: replace the .next symlink with a REAL dir (an un-migrated / broken host state).
  fs.unlinkSync(path.join(dir, ".next"));
  fs.mkdirSync(path.join(dir, ".next"));
  fs.writeFileSync(path.join(dir, ".next", "BUILD_ID"), "BUILD_REALDIR");
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, false, "deploy refused");
  assert.equal(r.rolledBack, false, "failed before swap — nothing to roll back");
  const states = r.trace.map((t) => `${t.state}:${t.status}`);
  assert.ok(states.includes("SWAP:error"), "invariant fails at the SWAP entry-criterion");
  assert.ok(/single-active invariant/.test(r.error), "reported the invariant violation");
  assert.ok(fs.lstatSync(path.join(dir, ".next")).isDirectory() && !fs.lstatSync(path.join(dir, ".next")).isSymbolicLink(), "the real .next dir was left untouched");
  clean(dir);
});

test("HISTORY: every run persists one record with transitions, timings, and rollback/smoke status", async () => {
  // success
  const d1 = sandbox(); const s = makeOps(d1);
  const ok = await runDeploy({ config: { stamp: "OK1" } }, s.ops);
  assert.equal(ok.ok, true);
  const okRec = s._.history.at(-1);
  assert.ok(okRec, "a record was persisted on success");
  assert.equal(okRec.stamp, "OK1"); assert.equal(okRec.buildId, "BUILD_NEW"); assert.equal(okRec.releaseId, "COMMIT_A");
  assert.equal(okRec.smokeStatus, "ok"); assert.equal(okRec.rollbackStatus, "none"); assert.equal(okRec.ok, true);
  assert.ok(okRec.trace.length > 0 && okRec.trace.every((t) => typeof t.t === "number"), "each transition timestamped");
  assert.ok(okRec.endedAt >= okRec.startedAt && okRec.durationMs >= 0, "duration recorded");
  clean(d1);

  // failure + rollback
  const d2 = sandbox(); const f = makeOps(d2, { failAt: "restart" });
  const bad = await runDeploy({ config: { stamp: "BAD1" } }, f.ops);
  assert.equal(bad.ok, false);
  const badRec = f._.history.at(-1);
  assert.ok(badRec, "a record was persisted on failure too");
  assert.equal(badRec.ok, false); assert.equal(badRec.rolledBack, true); assert.equal(badRec.rollbackStatus, "done");
  clean(d2);
});
