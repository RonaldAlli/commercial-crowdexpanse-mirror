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
function makeOps(dir, { failAt } = {}) {
  const link = path.join(dir, ".next");
  let previousTarget = null;
  const restarts = [];
  const target = () => { try { return fs.readlinkSync(link); } catch { return null; } };
  const servedBuildId = () => { try { return fs.readFileSync(path.join(link, "BUILD_ID"), "utf8").trim(); } catch { return null; } };
  const atomicSymlink = (t) => { const tmp = link + ".tmp"; try { fs.unlinkSync(tmp); } catch {} fs.symlinkSync(t, tmp); fs.renameSync(tmp, link); }; // rename(2) = atomic
  const gate = (s) => { if (failAt === s) throw new Error(`${s} failed (injected)`); };
  const ops = {
    log: () => {},
    precheck: async () => { previousTarget = target(); gate("precheck"); return { summary: `prev=${previousTarget}` }; },
    build: async (_c, { dryRun }) => { const rel = "releases/new"; const abs = path.join(dir, rel); fs.mkdirSync(abs, { recursive: true }); fs.writeFileSync(path.join(abs, "BUILD_ID"), "BUILD_NEW"); gate("build"); return { releaseDir: rel, absDir: abs, dryRun }; },
    verifyBuild: async (_c, built) => { gate("verifyBuild"); const id = fs.readFileSync(path.join(built.absDir, "BUILD_ID"), "utf8").trim(); if (!id) throw new Error("no BUILD_ID"); return { buildId: id }; },
    validateSwapTarget: async (_c, built) => { if (!fs.existsSync(built.absDir)) throw new Error("swap target missing"); },
    validateRollbackTarget: async () => { if (!previousTarget || !fs.existsSync(path.join(dir, previousTarget))) throw new Error("no readable previous release"); },
    swap: async (_c, built) => { atomicSymlink(built.releaseDir); gate("swap"); },
    restart: async () => { restarts.push(servedBuildId()); gate("restart"); },
    verifyRuntime: async (_c, buildId) => { gate("verifyRuntime"); if (servedBuildId() !== buildId) throw new Error("serving wrong build"); },
    smoke: async () => { gate("smoke"); },
    retain: async () => {},
    rollback: async () => { atomicSymlink(previousTarget); restarts.push(`ROLLBACK:${servedBuildId()}`); }, // repoint prev + "restart"
    releaseLock: async () => {},
  };
  return { ops, _: { target, servedBuildId, restarts } };
}
const clean = (d) => fs.rmSync(d, { recursive: true, force: true });

test("happy path: builds, atomically swaps, restarts, completes → serving the new release", async () => {
  const dir = sandbox(); const { ops, _ } = makeOps(dir);
  const r = await runDeploy({}, ops);
  assert.equal(r.ok, true); assert.equal(r.rolledBack, false);
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
