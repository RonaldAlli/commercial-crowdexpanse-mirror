# E1 · Core Fact Infrastructure — Technical Design

> **Phase 4 · Epic E1.** Resolves the *before-schema* realization questions (A-1 persistence/supersession/
> versioning/audit, A-6 collection facts, A-8 concurrency) and fixes the append-only fact store. **Scope: the
> foundational fact store ONLY** — no projection, authorization, policy evaluation, UI, or automation (those are
> E2–E8). Every element cites its governing law/invariant. On branch `feat/opp-pipeline-e1-fact-store`. 2026-07-22.

---

## 1. The core model — one append-only fact ledger

A single insert-only table `PipelineFact` (precedent: `AutomationExecution`, an existing insert-only ledger). **A
fact record is immutable after creation; there is no update or delete path.** State changes are new rows
(supersession). This realizes **Law 5 / GI-1**.

```prisma
model PipelineFact {
  id               String   @id @default(cuid())          // fact identity
  sequence         BigInt   @default(autoincrement())     // total order → deterministic reconstruction (A-8)
  organizationId   String                                 // org scoping (fail-closed reads, house idiom)
  opportunityId    String                                 // subject

  factType         String                                 // Spec-defined ontology; code-validated (registry)
  factClass        PipelineFactClass                      // ARTIFACT | EVIDENCE | DECISION  (GI-3)
  subjectKey       String?                                // collection-fact scope (A-6): item/contingency id
  state            String?                                // e.g. OPENED/RELEASED/FUNDED (5A-INV-2 states)
  payload          Json?                                  // structured: funds{recipient,purpose,amount,obligation}, evidence refs, exception scope

  policyVersion    String?                                // version-anchoring (STM-INV-7)
  ruleSetVersion   String?                                //   GI-2 reproducibility
  artifactVersion  String?                                //   LOI/contract version (3.1/4.1-INV-1)

  operation        PipelineFactOperation                  // DRAFT|RECORD_EVIDENCE|DECLARE|RETRACT|CORRECT|INVALIDATE|ACCEPT_EXCEPTION
  supersedesFactId String?                                // append-only supersession LINK (never a mutation) — GI-1
  supersedesFact   PipelineFact?  @relation("Supersession", fields: [supersedesFactId], references: [id])
  supersededBy     PipelineFact[] @relation("Supersession")

  actorType        PipelineActorType                      // HUMAN|EXTERNAL_PRINCIPAL|DETERMINISTIC_EVALUATOR|MIGRATION_PRINCIPAL
  actorId          String?                                // user/seam/evaluator/migration identity
  provenance       PipelineFactProvenance @default(VERIFIED) // VERIFIED | MIGRATION_ORIGIN  (STM §9c, AUTH-INV-9)
  reason           String?                                // required for RETRACT/REOPEN/CORRECT/ACCEPT_EXCEPTION (code-enforced)

  occurredAt       DateTime?                              // business event time (may differ from recordedAt)
  recordedAt       DateTime @default(now())               // when recorded (immutable; no @updatedAt)

  @@index([organizationId, opportunityId, factType, subjectKey])
  @@index([supersedesFactId])
  @@index([organizationId, opportunityId, sequence])
}

enum PipelineFactClass      { ARTIFACT  EVIDENCE  DECISION }
enum PipelineFactOperation  { DRAFT  RECORD_EVIDENCE  DECLARE  RETRACT  CORRECT  INVALIDATE  ACCEPT_EXCEPTION }
enum PipelineActorType      { HUMAN  EXTERNAL_PRINCIPAL  DETERMINISTIC_EVALUATOR  MIGRATION_PRINCIPAL }
enum PipelineFactProvenance { VERIFIED  MIGRATION_ORIGIN }
```
*No `@updatedAt`. The persistence service exposes only `record(...)` (insert). There is no method that mutates or
deletes a row.*

### 1a. Approved refinements (Ronald, 2026-07-22)

1. **Two identities.** `id` = **Fact Record Identity** (the immutable ledger row). `factChainId` = **Fact Semantic
   Identity** — constant across a supersession chain, so consumers answer "which *logical* fact is this?" by
   grouping on `factChainId` instead of recursively walking `supersedesFactId`. A first assertion sets
   `factChainId = its own id`; a superseding fact **inherits** the prior's `factChainId`.
2. **Typed payload.** `payload` is **Fact Header + typed payload**: the header columns are universal; `payload`
   MUST validate against a schema **registered by `factType`** (the ontology registry) — no `factType + blob`
   drift.
3. **Distinct version columns.** `policyVersion` / `ruleSetVersion` / `artifactVersion` remain **separate** (never a
   single `version`) — they mean different things.
4. **Deterministic order.** **`globalSequence` (BIGSERIAL) is authoritative** for ordering + replay; timestamps
   (`occurredAt`/`recordedAt`) are **informational** (clock skew never affects reconstruction).

---

## 2. Realization decisions

- **A-1 · Persistence + supersession + versioning + audit + immutability.** One insert-only ledger. **Supersession
  is a LINK, never a mutation:** to retract/correct/reopen/invalidate, insert a new row with `supersedesFactId` →
  the prior. The prior row is never touched (GI-1). Versions are first-class columns (policy/rule-set/artifact).
  Audit is intrinsic: `actorType/actorId/operation/reason/provenance/recordedAt/sequence` on every row.
- **A-6 · Collection facts.** `subjectKey` scopes per-item facts within a `factType` (e.g. `DILIGENCE_MATERIAL_
  RECEIVED` keyed by item; `CONTINGENCY_REMOVED` by contingency; `CHECKLIST_ITEM_SATISFIED` by item). Singleton
  facts leave it null. Later predicates aggregate "all required subjectKeys present."
- **A-8 · Concurrency.** Inserts don't contend (append-only). `sequence` gives a total order for deterministic
  reconstruction. **Active-fact resolution is DERIVED** (a fact is *active* iff no row supersedes it) — the ledger
  **never** stores an "active"/"superseded" flag (that would be a mutation *and* derived state — Laws 4 & 5).
  **Precondition/exclusivity conflicts (e.g. 2.1-INV-3) are NOT enforced here** — they are E3 (authorization,
  commit-time re-verify, `EXCLUSIVITY_CONFLICT`) and surface as E4 inconsistencies. E1 stays a pure store.

---

## 3. E1 persistence primitives (the only API E1 exposes)

Side-effect-scoped to **recording** facts (no reading-for-projection, no authorization — those are E2/E3/E4):
- `recordFact(input)` → inserts one immutable `PipelineFact` (validates `factType` against the ontology registry,
  `factClass` matches, required `reason` present for retract/correct/exception). Returns the fact.
- `recordSupersession(priorFactId, input)` → inserts a superseding fact linked to `priorFactId` (never mutates
  the prior); `operation ∈ {RETRACT, CORRECT, INVALIDATE}`.
- `reconstructHistory(opportunityId)` → returns all facts ordered by `sequence` (complete, immutable).
- `activeFacts(opportunityId)` → derived: facts with no successor (a **disposable** query/index, Law 4).
- `recordMigrationFact(input)` → `provenance = MIGRATION_ORIGIN`, `actorType = MIGRATION_PRINCIPAL` only.

E1 does **not** decide *whether* an operation is allowed (E3) or *what stage results* (E4). It records truth.

---

## 4. Exit-criteria mapping (founder's E1 gate → how E1 satisfies it)

| Exit criterion | Realized by | Acceptance |
|---|---|---|
| Facts immutable after creation | insert-only ledger; no update/delete method; no `@updatedAt` | AC-GI1-N1 |
| Supersession never mutates prior | `supersedesFactId` link; prior untouched | AC-GI1-P1, AC-GI1-R1 |
| Complete history reconstructable | `reconstructHistory` over `sequence` | AC-GI1-R1, versioning |
| Audit (actor/timestamp/operation/provenance/version/reason) | intrinsic columns; reason code-enforced | AC-GI1-* |
| Historical reconstruction → identical fact graph | total order via `sequence`; deterministic | (versioning scenario) |
| Migration-origin distinguishable from verified | `provenance` enum; migration principal only | AC-GI1-M1, AC-*-M* |
| Traceability | this doc → Spec §2/§1(GI-1) → STM/AUTH → AC-GI1-* → Matrix | (E1 row) |

---

## 5. Boundaries (what E1 must NOT do — Constitution)

No stage projection · no authorization/capability checks · no policy/predicate evaluation · no inconsistency
computation · no UI · no automation. Those inherit this store as a stable contract. E1 exposes *recording +
history reconstruction* only.

---

## 6. Build plan (this epic, on branch)

1. Prisma model + enums + **migration** (additive; timestamped; new table only — no change to existing models).
2. `lib/pipeline-facts/*.ts` — the persistence service (primitives §3) + the `factType` ontology registry
   (validates against the Spec's fact set) + immutability guard (no mutate/delete).
3. Acceptance tests `AC-GI1-*` (immutability, supersession, history reconstruction, audit completeness, migration
   provenance) as executable checks (Law 11 — E1 not "done" until these pass).
4. Gate: `tsc` · unit · build. Then present at the **epic-exit gate** for acceptance before E2.

---

## 7. Epic Exit Gate result (2026-07-22)

Foundation approved with the four refinements (all incorporated). Implementation complete on branch
`feat/opp-pipeline-e1-fact-store`.

**Gate (evaluated in the clean worktree, not the prod checkout):**
```
Architecture satisfied            ✓  append-only ledger · supersession-as-link · derived active-set · provenance · version cols · subjectKey · scope held (no projection/authz/policy/UI/automation)
Acceptance scenarios passing       ✓  AC-GI1 21/21 (Law 11)   — scripts/e2e-pipeline-facts.mjs
Traceability complete              ✓  E1 → Spec §2/GI-1 → STM/AUTH → AC-GI1-* → Traceability Matrix (E1 row)
No constitutional violations       ✓  facts append-only · no update/delete API · evidence never declared/synthesized (GI-3 guard) · one store · semantics unchanged
Ready for next epic                ✓  E2 (Predicate Engine) can consume this store
```
**Build gate:** `tsc` 0 · unit 73 files · AC-GI1 21/21 · `build:isolated` ok.

**Deviations / decisions beyond the approved design (disclosed):**
- **Scalar `organizationId` / `opportunityId` (no FK to Organization/Opportunity).** Chosen to keep the migration
  **fully additive** (new table only; no back-relations added to existing models). Only the self-supersession FK
  exists. DB-level referential integrity to org/opportunity is therefore not enforced by E1 (acceptable for an
  event ledger; FKs could be added later without semantic change).
- **Structural GI-3 class↔operation guard added in the service** (e.g. `DECLARE` rejected on an EVIDENCE fact) —
  defense-in-depth store integrity, distinct from the E3 authorization *decision*. Not a semantic change.
- **Process:** E1 was initially built in the prod checkout by mistake (whose `.next` is a deploy symlink, which
  pollutes `tsc`); corrected by moving the branch to the worktree for the clean gate; the prod checkout was
  restored to `main`. The **prod DB and running server were never touched** — the migration was applied to the
  `*_test` DB only.

**State:** branch pushed (`origin`); **NOT merged to main; migration NOT deployed to prod** — awaiting E1
acceptance. On acceptance: FF-merge → `migrate deploy` (26→+1) is a separate authorized step → then E2.
