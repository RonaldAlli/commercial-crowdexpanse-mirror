// Commercial Intelligence (v1.2, Commit 1c) — refresh orchestration.
//
// The ONE owner of the ingestion write path. Given a (pure) SourceAdapter and a
// payload, it: resolves an idempotency key, short-circuits duplicate runs, guards
// scope, records a durable RefreshJob (the sole audit surface), then in ONE
// transaction records observations → accepts signals (append-only, supersede by
// lineage) → triggers the ProjectionService. It introduces NO precedence or
// projection logic — it composes the frozen 1b primitives.
//
// Invariants (Volume 12):
//  - Refresh is OBSERVATIONAL — creates Observations/Signals + triggers Projection
//    only; never creates/merges/splits Owners, never deletes.
//  - Refresh is REPLAYABLE — identical adapter + payload + versions ⇒ identical
//    ledger + projection. Guaranteed two ways: job-grain idempotency (same
//    requestKey ⇒ return the prior job) and value-grain idempotency (a value equal
//    to the current lineage head is skipped — no redundant observation/signal).
//  - Refresh is ATOMIC — if ANY record is invalid, the whole run is rejected
//    before any write; a mid-transaction error rolls the ledger back and the job
//    is marked FAILED.
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { acceptObservationAsSignalTx, recordObservation } from "@/lib/intelligence/provenance";
import { recomputeOwnerField } from "@/lib/intelligence/projection";
import { isOwnerProjectedField, type OwnerProjectedField } from "@/lib/intelligence/owner-fields";
import type { RefreshInput, SourceAdapter } from "@/lib/intelligence/sources/types";

/** Thrown for caller-input problems (invalid records, missing target) — no job row is created. */
export class RefreshRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshRejectedError";
  }
}

// Stable stringify (sorted keys) so equal payloads hash equal regardless of key order.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** Deterministic content hash of a refresh payload — the fallback idempotency key. */
export function contentHash(adapter: SourceAdapter, input: RefreshInput): string {
  const payload = canonical({
    sourceKey: adapter.sourceKey,
    adapterVersion: adapter.adapterVersion,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    asOf: input.asOf.toISOString(),
    records: input.records,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Resolve the refresh target (existing entity, org-scoped). 1c: OWNER only, never creates. */
async function resolveTarget(organizationId: string, input: RefreshInput) {
  if (input.targetEntityType !== "OWNER") return null;
  return prisma.owner.findFirst({ where: { id: input.targetEntityId, organizationId }, select: { id: true } });
}

export interface RunRefreshOptions {
  actorUserId?: string;
}

/**
 * Run one refresh. Returns the terminal RefreshJob. Throws RefreshRejectedError
 * for invalid input (before any write). A mid-run failure resolves to a FAILED
 * job (ledger rolled back), not a throw.
 */
export async function runRefresh(
  organizationId: string,
  adapter: SourceAdapter,
  input: RefreshInput,
  opts: RunRefreshOptions = {},
) {
  const requestKey = input.requestKey ?? contentHash(adapter, input);

  // Job-grain idempotency: an identical prior run is returned, never re-applied.
  const existing = await prisma.refreshJob.findUnique({
    where: { organizationId_sourceKey_requestKey: { organizationId, sourceKey: adapter.sourceKey, requestKey } },
  });
  if (existing) return existing;

  // Precondition (before any job/ledger write): the target must exist in the org.
  // Never creates an Owner — a missing/cross-org target is a caller error.
  const target = await resolveTarget(organizationId, input);
  if (!target) throw new RefreshRejectedError("Refresh target not found in organization");

  // Commit to a run: create the durable job (audit surface + idempotency anchor).
  // Everything after this point resolves to a terminal job — never a throw.
  const job = await prisma.refreshJob.create({
    data: {
      organizationId,
      sourceKey: adapter.sourceKey,
      requestKey,
      status: "RUNNING",
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      actorUserId: opts.actorUserId,
      startedAt: new Date(),
    },
  });

  try {
    // Adapter (pure): fetch raw → map to candidates. Any rejected candidate fails
    // the whole atomic run before a single ledger write.
    const raws = await adapter.fetch(input);
    const ctx = { entityType: input.targetEntityType, entityId: input.targetEntityId, asOf: input.asOf };
    const candidates = raws.flatMap((r) => adapter.map(r, ctx));
    const rejected = candidates.filter((c) => c.rejected);
    if (rejected.length) {
      throw new RefreshRejectedError(`rejected ${rejected.length} record(s): ${rejected.map((c) => c.rejected!.reason).join("; ")}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      let recorded = 0;
      let accepted = 0;
      let superseded = 0;
      const affected = new Set<OwnerProjectedField>();

      for (const c of candidates) {
        // Value-grain idempotency: skip a value already current for this lineage —
        // no observation, no signal (keeps replays byte-for-byte identical).
        const head = await tx.intelligenceSignal.findFirst({
          where: { organizationId, entityType: c.entityType, entityId: c.entityId, fieldKey: c.fieldKey, sourceCategory: adapter.sourceCategory, state: "ACCEPTED" },
          select: { valueNormalized: true },
        });
        if (head && head.valueNormalized === (c.valueNormalized ?? null)) continue;

        const obs = await recordObservation(
          organizationId,
          { entityType: c.entityType, entityId: c.entityId, fieldKey: c.fieldKey, valueRaw: c.valueRaw, valueNormalized: c.valueNormalized, sourceCategory: adapter.sourceCategory, sourceId: adapter.sourceKey, asOf: c.asOf, method: c.method, adapterVersion: adapter.adapterVersion },
          tx,
        );
        recorded += 1;
        await acceptObservationAsSignalTx(tx, organizationId, obs.id);
        accepted += 1;
        if (head) superseded += 1;
        if (isOwnerProjectedField(c.fieldKey)) affected.add(c.fieldKey);
      }

      // Trigger projection for every affected field (frozen ProjectionService).
      for (const f of Array.from(affected)) await recomputeOwnerField(organizationId, input.targetEntityId, f, tx);
      return { recorded, accepted, superseded };
    });

    return await prisma.refreshJob.update({
      where: { id: job.id },
      data: {
        status: result.accepted === 0 ? "NOOP" : "SUCCEEDED",
        observationsRecorded: result.recorded,
        signalsAccepted: result.accepted,
        signalsSuperseded: result.superseded,
        affectedEntityIds: result.accepted === 0 ? [] : [input.targetEntityId],
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    // Ledger transaction rolled back — record the failure on the durable job row.
    const message = err instanceof Error ? err.message : String(err);
    return await prisma.refreshJob.update({
      where: { id: job.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
  }
}
