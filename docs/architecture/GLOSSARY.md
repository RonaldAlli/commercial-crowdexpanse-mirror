# Opportunity Pipeline — Architectural Glossary

> Terminology, not specification. One place to align on what each word means so engineers joining mid-stream read
> the codebase and contracts the same way. Each term links to its governing contract/decision. 2026-07-22.

## Truth layer (E1 — the ledger)

| Term | Meaning |
|---|---|
| **Fact** | An immutable ledger record (`PipelineFact`). Never mutated or deleted (GI-1). |
| **Fact Chain** | The semantic lineage of one logical fact across supersession, keyed by `factChainId` (constant across the chain). |
| **Supersession** | A new linked row that supersedes a prior fact (RETRACT / CORRECT / INVALIDATE) — a *link*, never a mutation. |
| **Provenance** | `VERIFIED` vs `MIGRATION_ORIGIN` — distinguishes recorded truth from migration-backfilled facts. |
| **Fact class (GI-3)** | `ARTIFACT` (may create) / `EVIDENCE` (record-only, never synthesized) / `DECISION` (declared, policy-gated). |
| Contracts | [E1 Public API](./E1_PUBLIC_API_CONTRACT.md) · [Decision Log](../releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md) |

## Interpretation layer (E2·A — the Fact Graph)

| Term | Meaning |
|---|---|
| **Fact Graph** | The single canonical, immutable interpretation of one opportunity's ledger (Law 12). Built by the one Fact Graph Builder. |
| **Structural Active Set** | The **unsuperseded** facts — the current tip of every chain, incl. RETRACT/INVALIDATE tips (`graph.activeFacts`). |
| **Decision-visible Active Set** | The structurally-active facts that **currently assert** their business claim; retractions suppress the assertion (`activeByType`/`collection`). |
| **Collection fact** | A per-item fact keyed by `subjectKey` (e.g. `DILIGENCE_MATERIAL_RECEIVED` by material). |
| **Version context** | `{ policyVersion, ruleSetVersion, artifactVersion? }` — the explicit context a graph is built under (reproducibility). |
| Contracts | [Fact Graph Contract](./FACT_GRAPH_CONTRACT.md) · [Fact Graph Public API](./FACT_GRAPH_PUBLIC_API.md) |

## Reasoning layer (E2·B — the Predicate Engine)

| Term | Meaning |
|---|---|
| **Predicate** | A pure, versioned business rule over a Fact Graph, identified by `(predicateId, ruleSetVersion)`. |
| **Evaluation Context** | The predicate's whole world: `{ graph, ruleSetVersion, policyVersion, registry, evaluate }`. |
| **EvaluationResult** | The **authoritative** evaluation outcome: `satisfied` + reasons/missing/factsRelied + `evaluationId` + `determinismStamp`. |
| **evaluationId** | A deterministic **identity** of an evaluation (`H(inputs)`) — a content address, *not* an execution/run id. |
| **EvaluationTrace** | The **deterministic explanation** — a finite tree of `TraceNode`s (logical only; no timing/exec). |
| **EvaluationArtifact** | The evaluator's single output object: `{ result, trace }`. (Unrelated to the GI-3 ARTIFACT fact class.) |
| Contracts | [Predicate Engine Design](./PREDICATE_ENGINE_DESIGN.md) · [EvaluationResult/Artifact Contract](./EVALUATION_RESULT_CONTRACT.md) |

## Permission layer (E3 — Authorization, forthcoming)

| Term | Meaning |
|---|---|
| **AuthorizationDecision** | The permission outcome for a fact operation: `allow` + `denyCodes` + the consumed `EvaluationArtifact` + actor/capability/operation. |
| **decisionId** | Deterministic identity over the authorization inputs (mirrors `evaluationId`). |
| **authorizationEventId** | *(if ever needed)* an execution/audit id — belongs outside the decision, never inside it. |
| Contracts | `AUTHORIZATION_DECISION_CONTRACT.md` (to be frozen before E3) |

## Cross-cutting

| Term | Meaning |
|---|---|
| **Projection / Stage** | A derived operational label computed from authoritative facts (E4) — disposable, never authoritative (OWN-1, Law 4). |
| **GI-1/2/3** | Global invariants: append-only facts · deterministic-evaluator contract · fact-class taxonomy. |
| **FG-INV-1..12** | Fact Graph invariants (single interpretation, immutable, reproducible, complete, …). |
| **PE-INV-1..9** | Predicate Engine invariants (isolation, referential transparency, graph-only, closure, trace determinism/completeness/locality/acyclic). |
| **Epic Exit Gate** | The per-slice acceptance checklist; nothing merges until it is green (Constitution). |
| Authority | [Engineering Constitution](./OPPORTUNITY_PIPELINE_ENGINEERING_CONSTITUTION.md) · [Business Semantics Spec](./BUSINESS_SEMANTICS_SPECIFICATION.md) |

## Architectural Laws (fast orientation)

The load-bearing laws by name — full text in the [Engineering Constitution](./OPPORTUNITY_PIPELINE_ENGINEERING_CONSTITUTION.md) (13 laws total).

| Law | One line |
|---|---|
| **Law 4** | Derived state (projections, traces, inconsistencies, caches) is disposable and reconstructable — never authoritative. |
| **Law 6** | Exactly one side-effect-free predicate evaluator serves authorization, projection, policy, what-if, and tests. |
| **Law 8** | Authorization is on fact operations, never stages; projector, evaluator, and authorization are all observational. |
| **Law 12** | Exactly one Fact Graph Builder — one interpretation of the ledger. |
| **Law 13** | Consumers reason only over the immutable FactGraph — never reconstruct, reinterpret, or supplement the ledger. |
