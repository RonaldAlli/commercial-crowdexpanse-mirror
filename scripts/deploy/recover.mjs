// D26 — Interrupted Deployment Recovery. This module is the RECOVERY brain, kept separate from the D25
// deploy engine (which is unchanged on its successful path). Two pieces:
//   1) assessLock(meta, facts) — a PURE, DETERMINISTIC function: given the same lock evidence + facts it
//      always reaches the same conclusion. It separates OBSERVED deployment state from the RECOMMENDED
//      recovery action (easy to reason about + unit test).
//   2) runRecovery(ctx, ops) — orchestrates an explicit recovery using injected ops (testable in a sandbox,
//      real on the host). It NEVER heals silently: it is only reached via `deploy --recover`.

export const PHASES = ["PRECHECK", "BUILD", "VERIFY_BUILD", "SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE", "COMPLETE"];
const PRE_SWAP = new Set(["PRECHECK", "BUILD", "VERIFY_BUILD"]);          // live release never changed
const POST_SWAP = new Set(["SWAP", "RESTART", "VERIFY_RUNTIME", "SMOKE"]); // `.next` may point at the new release

/** Last journalled phase from the append-only event log (the forensic trail). */
export function lastPhase(meta) {
  if (!meta || !Array.isArray(meta.events) || meta.events.length === 0) return null;
  return meta.events[meta.events.length - 1].phase ?? null;
}

/**
 * PURE + DETERMINISTIC. Separates OBSERVED state from a RECOMMENDATION.
 * @param meta  parsed lock.json, or null (missing), or { __corrupt:true } (unreadable)
 * @param facts { ownerAlive:boolean, now:number(ms), nextTarget:string|null, maxAgeMs:number }
 * @returns { classification, phase, observed, recommendation, reason }
 *   classification: ACTIVE | STALE | UNKNOWN | NONE
 *   recommendation: NONE | REFUSE_BUSY | CLEAN | ROLLBACK | FINALIZE | MANUAL
 */
export function assessLock(meta, facts) {
  const F = { ownerAlive: false, now: 0, nextTarget: null, maxAgeMs: 1800000, ...facts };
  if (meta === null) {
    return { classification: "NONE", phase: null, observed: { present: false }, recommendation: "NONE", reason: "no lock present — nothing to recover" };
  }
  if (meta.__corrupt) {
    return { classification: "UNKNOWN", phase: null, observed: { present: true, corrupt: true }, recommendation: "MANUAL", reason: "lock metadata unreadable — recover explicitly (fail-closed)" };
  }
  const phase = lastPhase(meta);
  const startedMs = Date.parse(meta.startedAt);
  const ageMs = Number.isFinite(startedMs) ? F.now - startedMs : Infinity;
  const observed = { present: true, pid: meta.pid, host: meta.host, phase, ageMs, release: meta.release ?? null, previous: meta.previous ?? null, nextTarget: F.nextTarget };

  // ACTIVE = owner alive AND within the max deploy duration. Never mistake a live deploy for stale.
  if (F.ownerAlive && ageMs < F.maxAgeMs) {
    return { classification: "ACTIVE", phase, observed, recommendation: "REFUSE_BUSY", reason: "owner process alive and within max deploy duration — a deployment is in progress" };
  }
  const why = !F.ownerAlive ? "owner process not alive" : "exceeded max deploy duration";

  if (phase === null) {
    return { classification: "UNKNOWN", phase, observed, recommendation: "MANUAL", reason: `${why}; no phase journal — recover explicitly (fail-closed)` };
  }
  if (PRE_SWAP.has(phase)) {
    return { classification: "STALE", phase, observed, recommendation: "CLEAN", reason: `${why}; interrupted BEFORE swap — live release untouched; drop lock + delete partial release` };
  }
  if (POST_SWAP.has(phase)) {
    // The swap is atomic — `.next` is the ground truth (never partial).
    if (F.nextTarget != null && F.nextTarget === meta.release) {
      return { classification: "STALE", phase, observed, recommendation: "ROLLBACK", reason: `${why}; swap landed but unverified (.next→new release) — roll back to previous` };
    }
    return { classification: "STALE", phase, observed, recommendation: "CLEAN", reason: `${why}; swap did not land (.next→${F.nextTarget}) — drop lock + delete partial release` };
  }
  if (phase === "COMPLETE") {
    return { classification: "STALE", phase, observed, recommendation: "FINALIZE", reason: `${why}; deploy had completed (post-swap, verified) — finish retention + drop lock` };
  }
  return { classification: "UNKNOWN", phase, observed, recommendation: "MANUAL", reason: `${why}; unrecognized phase '${phase}' — recover explicitly` };
}

/**
 * Explicit, auditable recovery. Injected ops make it testable + host-agnostic:
 *   readLock() → meta|null|{__corrupt}, gatherFacts(meta) → facts, clean(meta), rollback(meta),
 *   finalize(meta), writeReport(record), releaseLock(), now(), log?().
 * Idempotent (no lock ⇒ NONE) and safe to re-run if itself interrupted (lock drop is last).
 */
export async function runRecovery(ctx, ops) {
  const startedAt = ops.now ? ops.now() : Date.now();
  const meta = await ops.readLock();
  const facts = await ops.gatherFacts(meta);
  const assessment = assessLock(meta, facts);
  ops.log?.(`observed: ${JSON.stringify(assessment.observed)}`);
  ops.log?.(`classification=${assessment.classification} recommendation=${assessment.recommendation} — ${assessment.reason}`);

  const actions = [];
  let ok = true, error = null;
  try {
    switch (assessment.recommendation) {
      case "NONE": break; // nothing to recover
      case "REFUSE_BUSY": break; // a live deploy holds the lock — do NOT touch it
      case "CLEAN": await ops.clean(meta); actions.push("clean:dropped-lock+deleted-partial-release"); break;
      case "ROLLBACK": await ops.rollback(meta); actions.push("rollback:repointed-.next-to-previous+restart+dropped-lock"); break;
      case "FINALIZE": await ops.finalize(meta); actions.push("finalize:retained+dropped-lock"); break;
      case "MANUAL": actions.push("manual:no-automatic-action-taken"); break;
    }
  } catch (e) { ok = false; error = e.message; ops.log?.(`recovery action error: ${e.message}`); }

  const record = {
    startedAt, endedAt: ops.now ? ops.now() : Date.now(),
    originalLock: meta && !meta.__corrupt ? meta : (meta ? { __corrupt: true } : null),
    observed: assessment.observed,
    classification: assessment.classification,
    recommendation: assessment.recommendation,
    reason: assessment.reason,
    actions, ok, error,
  };
  try { await ops.writeReport?.(record); } catch (e) { ops.log?.(`report write error: ${e.message}`); }
  return { ...assessment, actions, ok, error, report: record };
}
