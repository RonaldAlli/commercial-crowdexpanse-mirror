// E2 · Slice A — the Fact Graph Builder: the SINGLE authoritative interpretation of the ledger.
//
// Constitution Law 12 / docs/architecture/FACT_GRAPH_CONTRACT.md. This is the ONLY component that reads
// the ledger for interpretation — it consumes ONLY the frozen E1 v1.0 API (reconstructHistory) and owns
// the one implementation of: reconstruction, supersession resolution, active-fact calculation, collection
// aggregation, and version resolution (FG-INV-1..5). It is pure, observational, deterministic (FG-INV-6/7),
// and exposes an immutable first-class `FactGraph` (FG-INV-8). It does NOT evaluate predicates, project
// stages, authorize operations, or mutate facts (FG-INV-11) — those are E2 Slice B / E3 / E4.

import { PipelineFactOperation, type PipelineFactProvenance, type PipelineFact } from "@prisma/client";
import { reconstructHistory } from "./service";

/** The explicit policy/rule-set context a graph is built under (reproducibility — FG-INV-7). */
export type VersionContext = {
  policyVersion: string;
  ruleSetVersion: string;
  artifactVersion?: string | null;
};

/** The required, explicit input to the Builder — nothing implicit (per the contract §4.1). */
export type FactGraphRequest = {
  organizationId: string;
  opportunityId: string;
  versionContext: VersionContext;
};

/**
 * An EXPLICIT context for structural-only consumers (e.g. the `activeFacts()` compatibility façade).
 * Active-fact / supersession / collection interpretation is version-INDEPENDENT, so this yields the same
 * structural set as any other context. It is a named constant — explicit, never an implicit default.
 */
export const STRUCTURAL_CONTEXT: VersionContext = Object.freeze({
  policyVersion: "STRUCTURAL",
  ruleSetVersion: "STRUCTURAL",
});

/** Chain tips that WITHDRAW a fact — present in history but "absent-for-decision". CORRECT still asserts. */
const WITHDRAWAL_OPS: ReadonlySet<PipelineFactOperation> = new Set([
  PipelineFactOperation.RETRACT,
  PipelineFactOperation.INVALIDATE,
]);

export type CollectionView = {
  /** subjectKey → the asserted active fact for that item (withdrawn items are absent). */
  byKey: ReadonlyMap<string, PipelineFact>;
  /** the set of present (asserted) subjectKeys — for "all required present/satisfied" checks. */
  keys: ReadonlySet<string>;
};

export type ChainView = {
  /** the full lineage of one semantic fact, in authoritative order. */
  all: readonly PipelineFact[];
  /** the unsuperseded tip (structural). */
  active: PipelineFact | undefined;
  /** the tip if it asserts the fact (undefined when the tip is a RETRACT/INVALIDATE). */
  asserted: PipelineFact | undefined;
};

/**
 * The canonical, immutable interpretation of one opportunity's ledger. Consumers hold this stable domain
 * object and ask it questions; they never manipulate reconstruction results directly (FG-INV-8).
 */
export class FactGraph {
  private readonly _history: readonly PipelineFact[];
  private readonly _versionContext: VersionContext;
  private readonly _supersededIds: ReadonlySet<string>;
  private readonly _activeFacts: readonly PipelineFact[];

  /** Construct ONLY via `buildFactGraph` (Law 12: a single constructor path). `history` is ledger order. */
  constructor(history: readonly PipelineFact[], versionContext: VersionContext) {
    // FG-INV-1 · one reconstruction: preserve the ledger's authoritative order (globalSequence asc).
    this._history = Object.freeze([...history]);
    this._versionContext = Object.freeze({ ...versionContext });
    // FG-INV-2 · one supersession resolution: a fact is superseded iff some row links to it.
    const superseded = new Set<string>();
    for (const f of history) if (f.supersedesFactId) superseded.add(f.supersedesFactId);
    this._supersededIds = superseded;
    // FG-INV-3 · one active-fact calculation: the unsuperseded rows (matches frozen E1 activeFacts).
    this._activeFacts = Object.freeze(history.filter((f) => !superseded.has(f.id)));
    Object.freeze(this); // FG-INV-6 · immutable graph.
  }

  /** The complete ordered history (immutable; never filtered) — FG-INV-10 history-preserving. */
  get history(): readonly PipelineFact[] {
    return this._history;
  }

  /** The context this graph was built under (reproducibility/replay). */
  get versionContext(): VersionContext {
    return this._versionContext;
  }

  /** FG-INV-3 · the one canonical active set (unsuperseded rows). */
  get activeFacts(): readonly PipelineFact[] {
    return this._activeFacts;
  }

  /** Whether a specific fact row is the unsuperseded tip of its chain. */
  isActive(factId: string): boolean {
    return !this._supersededIds.has(factId);
  }

  /** All facts of a type across history, in order (active determined via `isActive`/`activeByType`). */
  byFactType(factType: string): readonly PipelineFact[] {
    return this._history.filter((f) => f.factType === factType);
  }

  /** The lineage of one semantic fact: everything, the active tip, and the asserted tip. */
  byChain(factChainId: string): ChainView {
    const all = this._history.filter((f) => f.factChainId === factChainId);
    const active = all.find((f) => this.isActive(f.id));
    const asserted = active && !WITHDRAWAL_OPS.has(active.operation) ? active : undefined;
    return { all: Object.freeze(all), active, asserted };
  }

  /**
   * The asserted active singleton fact of a type, or undefined when none / withdrawn (absent-for-decision).
   * Version resolution: the returned fact carries its own resolved `artifactVersion` (e.g. the accepted
   * LOI/contract version) — FG-INV-5.
   */
  activeByType(factType: string): PipelineFact | undefined {
    const candidates = this._activeFacts.filter(
      (f) => f.factType === factType && f.subjectKey == null && !WITHDRAWAL_OPS.has(f.operation),
    );
    return candidates[candidates.length - 1]; // furthest by ledger order
  }

  /** FG-INV-4 · one collection aggregation: subjectKey → asserted active fact (withdrawn keys removed). */
  collection(factType: string): CollectionView {
    const byKey = new Map<string, PipelineFact>();
    for (const f of this._activeFacts) {
      if (f.factType !== factType || f.subjectKey == null) continue;
      if (WITHDRAWAL_OPS.has(f.operation)) byKey.delete(f.subjectKey);
      else byKey.set(f.subjectKey, f);
    }
    return { byKey, keys: new Set(byKey.keys()) };
  }

  /** Report a fact's provenance (VERIFIED vs MIGRATION_ORIGIN) without re-reading the ledger. */
  provenance(fact: PipelineFact): PipelineFactProvenance {
    return fact.provenance;
  }

  /** Self-check that the graph satisfies FG-INV-* — a guard for consumers/tests. Throws on violation. */
  assertInvariant(): void {
    if (!Object.isFrozen(this) || !Object.isFrozen(this._activeFacts) || !Object.isFrozen(this._history)) {
      throw new Error("FG-INV-6: graph is not immutable");
    }
    // FG-INV-2 · exactly one active tip per chain.
    for (const chainId of Array.from(new Set(this._history.map((f) => f.factChainId)))) {
      const activeInChain = this._history.filter((f) => f.factChainId === chainId && this.isActive(f.id));
      if (activeInChain.length !== 1) {
        throw new Error(`FG-INV-2: chain ${chainId} has ${activeInChain.length} active tips (expected 1)`);
      }
    }
    // FG-INV-3 · the active set is exactly the unsuperseded rows.
    for (const f of this._activeFacts) {
      if (this._supersededIds.has(f.id)) throw new Error("FG-INV-3: active set contains a superseded row");
    }
  }
}

/**
 * The ONE constructor of a FactGraph (Law 12). Ledger-only input via the frozen E1 v1.0 API
 * (`reconstructHistory`) — FG-INV-9. Pure/observational; same request + same history ⇒ identical graph.
 */
export async function buildFactGraph(request: FactGraphRequest): Promise<FactGraph> {
  const history = await reconstructHistory(request.organizationId, request.opportunityId);
  return new FactGraph(history, request.versionContext);
}
