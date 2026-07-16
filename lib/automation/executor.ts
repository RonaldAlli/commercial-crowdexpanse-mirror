// The Automation executor (Phase 2.0.1, Commit 4). Claims due jobs, evaluates policy, runs
// the registered handler, and finalizes — the ONLY component that acts on automation's
// behalf, and it ALWAYS evaluates policy first (AU-4). perform() is invoked only on an ALLOW
// decision; every other decision short-circuits to a clean NOOP. There is no path from queue
// to a handler that skips policy.
//
// IMPORTANT: importing this module has NO side effects. The polling loop starts ONLY when
// startExecutorLoop() is explicitly called (by the runtime entrypoint), never on import.

import type { AutomationJob, AutomationFailureClass } from "@prisma/client";
import type { AutomationDecision } from "./types";
import type { PolicyContext } from "./policy";
import { claimDueJobs, finalizeJob } from "./job-service";
import { nextStatusAfterFailure, nextAttemptAt } from "./lifecycle";
import { sanitizeError } from "./idempotency";
import { CLAIM_BATCH, IDLE_BACKOFF_MS } from "./types";

/**
 * A per-automation-type handler. `gatherContext` performs the org-scoped read-only work and
 * returns the policy context + fingerprint; `policy` is the pure gate; `perform` is invoked
 * by the executor ONLY when the policy returns ALLOW (it never gates itself).
 */
export type AutomationHandler = {
  automationType: string;
  policyKey: string;
  policyVersion: number;
  gatherContext(job: AutomationJob): Promise<{ context: PolicyContext; fingerprint: string }>;
  policy(context: PolicyContext): AutomationDecision;
  perform(
    job: AutomationJob,
    context: PolicyContext,
  ): Promise<{ producedDomainEffect: boolean; observationSummary?: string | null; activityLogId?: string | null }>;
};

export type HandlerRegistry = Record<string, AutomationHandler>;

/** Map a thrown error to a failure class (conservative; org-scope errors surface loudly). */
export function classifyError(err: unknown): AutomationFailureClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("organization") || msg.includes("cross-org")) return "ORG_SCOPE_VIOLATION";
  if (msg.includes("not found") || msg.includes("invalid") || msg.includes("validation")) {
    return "VALIDATION_FAILURE";
  }
  return "UNKNOWN";
}

/** Run one claimed job through policy → (perform on ALLOW) → finalize. Never throws. */
export async function runClaimedJob(handler: AutomationHandler, job: AutomationJob): Promise<AutomationJob> {
  const startedAt = new Date();
  const attemptNumber = job.runningAttempt ?? job.attempts;
  const principalKey = `automation:${handler.automationType}`;
  try {
    const { context, fingerprint } = await handler.gatherContext(job);
    const decision = handler.policy(context); // AU-4: mandatory, executor-driven, before perform
    if (decision.kind === "ALLOW") {
      const res = await handler.perform(job, context);
      const { job: updated } = await finalizeJob({
        job, attemptNumber, outcome: "SUCCEEDED",
        policyKey: handler.policyKey, policyVersion: handler.policyVersion, policyDecision: "ALLOW",
        contextFingerprint: fingerprint, startedAt, finishedAt: new Date(), principalKey,
        producedDomainEffect: res.producedDomainEffect, activityLogId: res.activityLogId ?? null,
        nextStatus: "SUCCEEDED",
      });
      return updated;
    }
    // Non-ALLOW → the policy gate stops here; perform() is NEVER reached. Clean NOOP.
    const { job: updated } = await finalizeJob({
      job, attemptNumber, outcome: "NOOP",
      policyKey: handler.policyKey, policyVersion: handler.policyVersion, policyDecision: decision.kind,
      contextFingerprint: fingerprint, startedAt, finishedAt: new Date(), principalKey,
      producedDomainEffect: false, nextStatus: "SUCCEEDED",
    });
    return updated;
  } catch (err) {
    const failureClass = classifyError(err);
    const ns = nextStatusAfterFailure(failureClass, job.attempts, job.maxAttempts);
    // policyDecision on a crashed attempt is a placeholder — outcome=FAILED + failureClass + error is authoritative.
    const { job: updated } = await finalizeJob({
      job, attemptNumber, outcome: "FAILED",
      policyKey: handler.policyKey, policyVersion: handler.policyVersion, policyDecision: "NO_ACTION",
      contextFingerprint: "", startedAt, finishedAt: new Date(), principalKey,
      producedDomainEffect: false, failureClass, error: sanitizeError(err),
      retryAllowed: ns === "RETRY_SCHEDULED",
      nextStatus: ns, nextAttemptAt: ns === "RETRY_SCHEDULED" ? nextAttemptAt(new Date(), job.attempts) : null,
    });
    return updated;
  }
}

/** Claim and process one bounded batch of due jobs. Unknown automation types dead-letter. */
export async function runExecutorOnce(
  registry: HandlerRegistry,
  now: Date,
  batch: number = CLAIM_BATCH,
): Promise<{ claimed: number; processed: number }> {
  const jobs = await claimDueJobs(now, batch);
  let processed = 0;
  for (const job of jobs) {
    const handler = registry[job.automationType];
    if (!handler) {
      const attemptNumber = job.runningAttempt ?? job.attempts;
      await finalizeJob({
        job, attemptNumber, outcome: "FAILED",
        policyKey: job.policyKey, policyVersion: job.policyVersion, policyDecision: "NO_ACTION",
        contextFingerprint: "", startedAt: now, finishedAt: new Date(), principalKey: "automation:unknown",
        producedDomainEffect: false, failureClass: "VALIDATION_FAILURE",
        error: `no handler registered for automationType "${job.automationType}"`,
        nextStatus: "DEAD_LETTERED",
      });
      processed++;
      continue;
    }
    await runClaimedJob(handler, job);
    processed++;
  }
  return { claimed: jobs.length, processed };
}

export type LoopHandle = { stop: () => Promise<void> };
export type LoopControls = {
  idleMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onError?: (err: unknown) => void;
};

/**
 * Start the bounded-polling executor loop. Idle → backoff; error → backoff (never a tight
 * loop). stop() flips the flag and awaits the in-flight iteration so active work completes
 * before shutdown (graceful). Only ever called by the runtime entrypoint.
 */
export function startExecutorLoop(registry: HandlerRegistry, controls: LoopControls = {}): LoopHandle {
  const sleep = controls.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = controls.now ?? (() => new Date());
  const idleMs = controls.idleMs ?? IDLE_BACKOFF_MS;
  let running = true;
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((r) => (resolveFinished = r));
  void (async () => {
    while (running) {
      try {
        const { processed } = await runExecutorOnce(registry, now());
        if (processed === 0) await sleep(idleMs);
      } catch (err) {
        controls.onError?.(err);
        await sleep(idleMs); // degraded-infrastructure backoff — no tight loop
      }
    }
    resolveFinished();
  })();
  return {
    stop: async () => {
      running = false;
      await finished;
    },
  };
}
