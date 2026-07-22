# E1 · Core Fact Infrastructure — Public API Contract **v1.0** (FROZEN)

> **What this freezes:** the *interface* of the append-only fact ledger — **not** its implementation. Every
> downstream epic (E2 Predicate Engine, E3 Authorization, E4 Projection, E5 Migration, E6 API, E7 UI, E8 Automation)
> **consumes these five operations and the `PipelineFact` shape**, and MUST NOT reach into storage details (Prisma
> models, SQL, table layout). The implementation behind this contract may change freely as long as the contract
> holds. Frozen 2026-07-22 at `opp-slice2-e1-complete` (`8ca5a3f`). Module: `lib/pipeline-facts`.
>
> **Change discipline:** a change to this contract follows the same traceability as everything else —
> `Code → Architecture → Specification → Business Decision`. A **breaking** change bumps the major version (v2.0)
> and requires the decision process; an additive, backward-compatible change bumps the minor (v1.1). This document
> is the authority for what "the ledger API" means.

---

## 1. Consumption rule (Constitution alignment)

- Consumers import **only** from `lib/pipeline-facts` (the barrel). They never import `@/lib/prisma` to read/write
  `pipeline_facts`, never issue raw SQL against it, and never depend on column names or index shapes.
- The ledger is **record + reconstruct only**. It performs **no** projection, authorization, policy evaluation, or
  inconsistency computation (Laws 4/6/8). Those are E2–E4 and are *observers* of this contract.
- Immutability is **by construction**: this contract exposes **no update and no delete operation**. It is not an
  omission that could be "added later" — mutation is outside the contract by design (GI-1 / Law 5).

## 2. The value type — `PipelineFact` (read shape)

A returned fact is the immutable ledger row. Consumers may read these fields; the **stable, contract-relevant**
ones are:

| Field | Meaning | Contract note |
|---|---|---|
| `id` | fact **record** identity (one immutable row) | stable, unique |
| `factChainId` | fact **semantic** identity — constant across a supersession chain | group on this to answer "which *logical* fact" — never walk `supersedesFactId` recursively |
| `globalSequence` (BigInt) | authoritative total order for replay | ordering key; timestamps are informational only |
| `organizationId`, `opportunityId` | scope / subject | every read is org-scoped, fail-closed |
| `factType` | ontology key (registry-validated) | consumers switch on this, not on payload shape |
| `factClass` | `ARTIFACT` \| `EVIDENCE` \| `DECISION` (GI-3) | |
| `subjectKey` | collection-fact scope (nullable) | present for per-item facts |
| `state`, `payload` | typed state + registry-validated payload | payload schema is keyed by `factType` |
| `policyVersion`, `ruleSetVersion`, `artifactVersion` | version anchoring | kept **distinct**; never collapse |
| `operation` | how the row came to be (`DRAFT`/`RECORD_EVIDENCE`/`DECLARE`/`RETRACT`/`CORRECT`/`INVALIDATE`/`ACCEPT_EXCEPTION`) | |
| `supersedesFactId` | link to the prior row this supersedes (nullable) | supersession is a **link**, never a mutation |
| `actorType`, `actorId`, `provenance`, `reason` | intrinsic audit | `provenance ∈ {VERIFIED, MIGRATION_ORIGIN}` |
| `occurredAt`, `recordedAt` | business-event vs record time | **informational**; never the ordering authority |

## 3. The five operations (the entire write/read surface)

### `recordFact(input: RecordFactInput): Promise<PipelineFact>`
Assert a **fresh** fact, starting a new supersession chain (`factChainId` minted). Insert-only.
- `operation` must be a **fresh-assertion** op valid for the factType's GI-3 class: `ARTIFACT→DRAFT`,
  `EVIDENCE→RECORD_EVIDENCE`, `DECISION→DECLARE | ACCEPT_EXCEPTION`. **Evidence is never `DECLARE`d** (AUTH-INV-3).
- Rejects: unknown `factType` (registry); a superseding op (use `recordSupersession`); wrong op for class; a
  collection factType with no `subjectKey`; missing `reason` where required; payload failing the registry validator.

### `recordMigrationFact(input & { actorId }): Promise<PipelineFact>`
As `recordFact`, but stamps `provenance = MIGRATION_ORIGIN` and forces `actorType = MIGRATION_PRINCIPAL`. The only
way to introduce migration-origin facts (STM §9c, AUTH-INV-9). Same validation as fresh assertion.

### `recordSupersession(organizationId, priorFactId, input: SupersedeInput): Promise<PipelineFact>`
Supersede a prior fact via a **new linked row** — the prior is never touched (GI-1). The successor **inherits**
`factType`, `factClass`, `subjectKey`, `factChainId`; only `operation` + `reason` (+ any corrected
state/payload/versions) differ.
- `operation ∈ {RETRACT, CORRECT, INVALIDATE}`; `reason` always required.
- `RETRACT` → DECISION only. `INVALIDATE` → ARTIFACT/EVIDENCE only. `CORRECT` → any.
- Org-scoped, fail-closed: a prior not found within `organizationId` is rejected.

### `reconstructHistory(organizationId, opportunityId): Promise<PipelineFact[]>`
Complete, immutable history in authoritative order (`globalSequence` asc). The basis for every observation.

### `activeFacts(organizationId, opportunityId): Promise<PipelineFact[]>`
**Derived** — a fact is active iff no row supersedes it. Disposable derived state (Law 4); the ledger stores no
active/superseded flag. This is the set predicates/projection consume.

## 4. Input types (frozen field sets)

`RecordFactInput` = `{ organizationId, opportunityId, factType, operation, subjectKey?, state?, payload?,
policyVersion?, ruleSetVersion?, artifactVersion?, actorType, actorId?, reason?, occurredAt? }`.

`SupersedeInput` = `{ operation, reason, actorType, actorId?, state?, payload?, policyVersion?, ruleSetVersion?,
artifactVersion?, occurredAt? }`.

## 5. Invariants a consumer may rely on

1. No consumer can mutate or delete a fact through this API — none exists (GI-1).
2. `factChainId` is stable and shared across a chain; `id` is unique per row.
3. `globalSequence` is a strict total order sufficient for deterministic replay.
4. Reads are org-scoped and fail closed.
5. Structural GI-3 integrity (class↔operation) is enforced at record time — an EVIDENCE row can never have been
   `DECLARE`d. (This is store integrity, distinct from the E3 authorization *decision*.)
6. `provenance` distinguishes `VERIFIED` from `MIGRATION_ORIGIN` on every row.

## 6. What is explicitly **out** of this contract (owned by later epics)

Whether an operation is *allowed* (E3 authorization) · what *stage* results (E4 projection) · whether a policy
predicate holds (E2) · cross-fact exclusivity/precondition conflicts (E3 commit-time; surfaced as E4
inconsistencies). E1 records truth; it never decides.
