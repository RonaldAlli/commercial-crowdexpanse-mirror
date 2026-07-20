// D25 Deployment Engine — a deployment modeled as an explicit STATE MACHINE, not a shell script.
// The engine is PURE ORCHESTRATION: every side-effecting operation is INJECTED via `ops`, so the whole
// lifecycle (including rollback + idempotency + history) runs identically against the real host or a
// sandbox fixture in tests.
//
// States: PRECHECK → BUILD → VERIFY_BUILD → SWAP → RESTART → VERIFY_RUNTIME → SMOKE → COMPLETE.
// Each state has entry/exit criteria (enforced by its op throwing on failure) and a defined rollback.
// Rollback is scope-aware: before SWAP nothing live changed (just discard the new release); after SWAP,
// rollback repoints the `.next` symlink to the previous release and restarts — no manual intervention.
//
// INVARIANT (exactly one active release): SWAP's entry-criterion asserts `.next` is a proper symlink
// resolving to exactly one valid release (never a real dir competing with releases/, never a dangling
// target) BEFORE repointing — a violation fails pre-swap, so the live release is never touched. The same
// assertion runs in dry-run validation.
//
// IDEMPOTENCY: PRECHECK resolves the REQUESTED release identity (e.g. source commit) and the ACTIVE
// release identity (marker in the live release). If they match (and not --force), the engine short-
// circuits to ALREADY_ACTIVE — no build, no swap, no restart — and returns success. Deploy commands get
// rerun accidentally; a re-run at the same release is a safe no-op.
//
// HISTORY: every run (success, failure, no-op, dry-run) persists ONE history record via ops.persistTrace
// — state transitions + timings + BUILD_ID + release id + rollback/smoke status — invaluable in incidents.
//
// `--dry-run` executes only the non-mutating states (PRECHECK, BUILD, VERIFY_BUILD) plus swap-target +
// rollback-target + disk + retention VALIDATION, and STOPS before SWAP; it is inherently safe to rerun.

export const STATES = ["PRECHECK", "BUILD", "VERIFY_BUILD", "SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE", "COMPLETE"];

// ops (all async unless noted): precheck, build, verifyBuild, validateSwapTarget, validateRollbackTarget,
//   swap, restart, verifyRuntime, smoke, retain, rollback, releaseLock, persistTrace, log, now (sync).
// Each state op throws on failure (an unmet exit criterion). The engine catches, rolls back, and reports.

export async function runDeploy(ctx, ops, { dryRun = false, force = false } = {}) {
  const now = () => (ops.now?.() ?? Date.now());
  const startedAt = now();
  const trace = [];
  const rec = (state, status, detail = "") => {
    trace.push({ state, status, detail, t: now() });
    ops.log?.(`[${state}] ${status}${detail ? " — " + detail : ""}`);
  };
  let swapped = false;      // once true, rollback must restore the previous release + restart
  let noop = false;         // true when idempotency short-circuits (nothing changed)
  let buildId = null, releaseId = null;
  let outcome = { ok: false, trace, error: "engine did not complete" };

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
    if (!swapped) { rec("ROLLBACK", "skipped", "no swap occurred — live release never changed"); return; }
    rec("ROLLBACK", "start", reason);
    await ops.rollback(ctx); // repoint .next → previous release + restart + verify (in the op)
    rec("ROLLBACK", "done", "previous release restored, process restarted");
  }

  // One history record per run — derived convenience fields + the full trace. Persisted in `finally`,
  // so it captures success, failure, no-op, dry-run, and rollback-failed paths identically.
  function historyRecord() {
    const smoke = trace.some((t) => t.state === "SMOKE" && t.status === "ok") ? "ok"
      : trace.some((t) => t.state === "SMOKE") ? "failed" : "not-reached";
    const rollbackStatus = trace.filter((t) => t.state === "ROLLBACK").map((t) => t.status).at(-1) ?? "none";
    return {
      stamp: ctx.config?.stamp ?? null, releaseId, buildId,
      ok: outcome.ok, noop, dryRun, swapped,
      rolledBack: outcome.rolledBack ?? false, rollbackFailed: outcome.rollbackFailed ?? false,
      smokeStatus: smoke, rollbackStatus,
      error: outcome.error ?? null,
      startedAt, endedAt: now(), durationMs: now() - startedAt,
      trace,
    };
  }

  try {
    await step("PRECHECK", () => ops.precheck(ctx)); // repo/clean, disk, retention headroom, lock, prev + IDs
    releaseId = ctx.requestedReleaseId ?? null;

    // IDEMPOTENCY: requested release already active → no-op success (skip build/swap/restart). --force
    // bypasses. Dry-run does NOT short-circuit here — it is non-mutating and meant to re-validate freely.
    if (!dryRun && !force && ctx.requestedReleaseId != null && ctx.requestedReleaseId === ctx.activeReleaseId) {
      noop = true; buildId = ctx.activeBuildId ?? null;
      rec("ALREADY_ACTIVE", "noop", `release ${ctx.requestedReleaseId} already active — no changes made`);
      outcome = { ok: true, noop: true, dryRun: false, trace, buildId, releaseId, rolledBack: false };
      return outcome;
    }

    const built = await step("BUILD", () => ops.build(ctx, { dryRun }));      // build into releases/<stamp>
    const vb = await step("VERIFY_BUILD", () => ops.verifyBuild(ctx, built)); // BUILD_ID + required manifests
    buildId = vb.buildId;

    if (dryRun) {
      await step("VALIDATE_SWAP_TARGET", () => ops.validateSwapTarget(ctx, built));
      await step("VALIDATE_ROLLBACK_TARGET", () => ops.validateRollbackTarget(ctx));
      await step("ASSERT_SINGLE_ACTIVE", () => ops.assertSingleActive?.(ctx)); // invariant checked in dry-run too
      rec("DRY_RUN", "complete", "validated build + swap-target + rollback-target + single-active + disk + retention; live server unchanged");
      outcome = { ok: true, dryRun: true, trace, buildId: vb.buildId, releaseId };
      return outcome;
    }

    // ATOMIC swap: ln -sfn releases/<stamp> .next (rename(2)). swapped flips only on success. The
    // single-active INVARIANT is the swap's entry-criterion: verify exactly one release is active BEFORE
    // repointing — a violation fails here (pre-swap), so the live release is never touched.
    await step("SWAP", async () => {
      await ops.assertSingleActive?.(ctx);
      await ops.swap(ctx, built);
      swapped = true;
      return { summary: "symlink → " + built.releaseDir };
    });
    await step("RESTART", () => ops.restart(ctx));                 // pm2 restart + wait-for-online
    await step("VERIFY_RUNTIME", () => ops.verifyRuntime(ctx, vb.buildId)); // online + serving NEW buildId + health
    await step("SMOKE", () => ops.smoke(ctx));                     // routes / migrations
    await step("COMPLETE", () => ops.retain(ctx));                 // prune old releases to a fixed N

    outcome = { ok: true, dryRun: false, trace, buildId: vb.buildId, releaseId, rolledBack: false };
    return outcome;
  } catch (err) {
    try { await rollback(err.message); }
    catch (rbErr) { rec("ROLLBACK", "error", rbErr.message); outcome = { ok: false, trace, error: err.message, rolledBack: swapped, rollbackFailed: true }; return outcome; }
    outcome = { ok: false, trace, error: err.message, rolledBack: swapped };
    return outcome;
  } finally {
    try { await ops.persistTrace?.(ctx, historyRecord()); } catch (e) { ops.log?.(`[PERSIST] error — ${e.message}`); }
    try { await ops.releaseLock?.(ctx); } catch { /* lock release is best-effort */ }
  }
}
