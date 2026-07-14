// Commercial Intelligence (v1.2, Commit 1c) — the SourceAdapter contract.
//
// A SourceAdapter is the ONLY thing that has to change to add a new ingestion
// source (CSV, county records, licensed providers, later AI). The orchestrator,
// ledger, and projection engine stay fixed. Adapters are PURE describers:
//   - fetch(): the sole I/O boundary — retrieve raw records.
//   - map():   a pure transform from a raw record to candidate observations.
// An adapter NEVER writes the database, calls the ProjectionService, or performs
// permission checks. All mutation belongs to the refresh orchestrator (Volume 12
// "adapters are pure"). This keeps every adapter trivially unit-testable.
import type { IntelligenceEntityType, SourceCategory } from "@prisma/client";

/** An opaque source record, shaped by the adapter's own upstream format. */
export type RawRecord = Record<string, unknown>;

/** The entity a refresh targets, plus the batch observation time. */
export interface RefreshContext {
  entityType: IntelligenceEntityType;
  entityId: string;
  asOf: Date;
}

/**
 * One field-level candidate an adapter derived from a raw record. The orchestrator
 * stamps provenance metadata (sourceCategory/sourceId/adapterVersion) from the
 * adapter's identity — the adapter only decides field + value + validity. A
 * candidate flagged `rejected` fails the whole (atomic) refresh with its reason.
 */
export interface CandidateObservation {
  entityType: IntelligenceEntityType;
  entityId: string;
  fieldKey: string;
  valueRaw: string;
  valueNormalized?: string | null;
  asOf: Date;
  method: string;
  rejected?: { reason: string };
}

/** The input to one refresh run. `asOf` is caller-supplied so runs are replayable. */
export interface RefreshInput {
  targetEntityType: IntelligenceEntityType;
  targetEntityId: string;
  asOf: Date;
  records: RawRecord[];
  /** Optional idempotency key; when absent the orchestrator derives a content hash. */
  requestKey?: string;
}

export interface SourceAdapter {
  /** Stable source identifier, stamped as `sourceId` on every observation. */
  readonly sourceKey: string;
  /** Precedence tier this adapter's signals occupy. */
  readonly sourceCategory: SourceCategory;
  /** Adapter logic version, recorded on every observation for traceability. */
  readonly adapterVersion: number;
  /** The only I/O boundary — retrieve raw records for this run. */
  fetch(input: RefreshInput): Promise<RawRecord[]>;
  /** PURE: map one raw record into zero-or-more candidate observations. */
  map(raw: RawRecord, ctx: RefreshContext): CandidateObservation[];
}
