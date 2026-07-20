// D25 Deployment Engine — a deployment modeled as an explicit STATE MACHINE, not a shell script.
// The engine is PURE ORCHESTRATION: every side-effecting operation is INJECTED via `ops`, so the whole
// lifecycle (including rollback) runs identically against the real host or a sandbox fixture in tests.
//
// States: PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE.
// Each state has entry/exit criteria (enforced by its op throwing on failure) and a defined rollback.
// Rollback is scope-aware: before SWAP nothing live changed (just discard the new release); after SWAP,
// rollback repoints the `.next` symlink to the previous release and restarts — no manual intervention.
//
// `--dry-run` executes only the non-mutating states (PRECHECK, BUILD to a scratch/target, VERIFY_BUILD)
// plus swap-target + rollback-target + disk + retention VALIDATION, and STOPS before SWAP — the live
// server is never changed.

export const STATES = ["PRECHECK", "BUILD", "VERIFY_BUILD", "SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE", "COMPLETE"];

// ops (all async): precheck, build, verifyBuild, validateSwapTarget, validateRollbackTarget,
//                  swap, restart, verifyRuntime, smoke, retain, rollback, releaseLock, log
// Each throws on failure (an unmet exit criterion). The engine catches, rolls back, and reports.

export async function runDeploy(ctx, ops, { dryRun = false } = {}) {
  const trace = [];
  const rec = (state, status, detail = "") => {
    trace.push({ state, status, detail });
    ops.log?.(`[${state}] ${status}${detail ? " — " + detail : ""}`);
  };
  let swapped = false; // once true, rollback must restore the previous release + restart

  // Run one lifecycle state: record start → ok, or record `<STATE>:error` and rethrow. This makes
  // failures deterministic — the trace names exactly which state failed and what its rollback did.
  async function step(state, fn) {
    rec(state, "start");
    try {
      const out = await fn();
      rec(state, "ok", typeof out?.summary === "string" ? out.summary : undefined);
      return out;
    } catch (e) {
      rec(state, "error", e.message);
      throw e;
    }
  }

  async function rollback(reason) {
    if (!swapped) {
      rec("ROLLBACK", "skipped", "no swap occurred — live release never changed");
      return;
    }
    rec("ROLLBACK", "start", reason);
    await ops.rollback(ctx); // repoint .next → previous release + restart + verify (in the op)
    rec("ROLLBACK", "done", "previous release restored, process restarted");
  }

  try {
    await step("PRECHECK", () => ops.precheck(ctx)); // repo/clean, disk-space, retention headroom, lock, previous-release known
    const built = await step("BUILD", () => ops.build(ctx, { dryRun })); // build into releases/<stamp>; returns { releaseDir }
    const vb = await step("VERIFY_BUILD", () => ops.verifyBuild(ctx, built)); // BUILD_ID present + required manifests

    if (dryRun) {
      await step("VALIDATE_SWAP_TARGET", () => ops.validateSwapTarget(ctx, built)); // the symlink COULD be repointed here
      await step("VALIDATE_ROLLBACK_TARGET", () => ops.validateRollbackTarget(ctx)); // a readable previous release exists
      rec("DRY_RUN", "complete", "validated build + swap-target + rollback-target + disk + retention; live server unchanged");
      return { ok: true, dryRun: true, trace, buildId: vb.buildId };
    }

    // ATOMIC swap: ln -sfn releases/<stamp> .next (rename(2)). swapped flips only on success, so the
    // rollback scope below is exact.
    await step("SWAP", async () => { await ops.swap(ctx, built); swapped = true; return { summary: "symlink → " + built.releaseDir }; });
    await step("RESTART", () => ops.restart(ctx)); // pm2 restart + wait-for-online
    await step("VERIFY_RUNTIME", () => ops.verifyRuntime(ctx, vb.buildId)); // online + serving NEW buildId + health ok
    await step("SMOKE", () => ops.smoke(ctx)); // routes / migrations (as today)
    await step("COMPLETE", () => ops.retain(ctx)); // prune old releases + rollback snapshots to a fixed N

    return { ok: true, dryRun: false, trace, buildId: vb.buildId, rolledBack: false };
  } catch (err) {
    try { await rollback(err.message); }
    catch (rbErr) { rec("ROLLBACK", "error", rbErr.message); return { ok: false, trace, error: err.message, rolledBack: swapped, rollbackFailed: true }; }
    return { ok: false, trace, error: err.message, rolledBack: swapped };
  } finally {
    try { await ops.releaseLock?.(ctx); } catch { /* lock release is best-effort */ }
  }
}
