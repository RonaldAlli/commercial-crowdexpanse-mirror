# E3 · Authorization · Epic Exit Gate

> Implementation of the corrected [E3 Authorization Design](./E3_AUTHORIZATION_DESIGN.md). Pure decision function +
> commit-time guard over an already-computed `EvaluationArtifact`; applies capability + policy only (Law 8/13,
> AUTH-INV-10/12/13/14). Branch `feat/opp-pipeline-e3-authorization` off `main` (`db34b40`). Code-only. 2026-07-22.

## What was built (permission only — no eval/reconstruct/ledger-read/projection)

- **`lib/pipeline-authorization/types.ts`** — `ActorSnapshot` `{actorId, actorClass, capabilities[], identityVersion?}`;
  `OperationRef`; first-class versioned `AuthorizationPolicy` (`policyId`, structured `requiredVersionScope`,
  `requiredRuleSetVersion`, `predicateRequirement`); frozen `DenyCode` union (§11a); `AuthorizationDecision
  {decision, explanation}`.
- **`lib/pipeline-authorization/authorize.ts`** — the **pure** decision. Six-group canonical deny precedence
  (independent of check order); **frozen §11a codes only** (`INSUFFICIENT_CAPABILITY` covers actor-class-not-allowed
  via structured `ACTOR_CLASS_NOT_ALLOWED` reason; `VERSION_MISMATCH` carries binding detail); `decisionId =
  H(actor, capability, operation, evaluationId, policyId, policyVersion, canonicalDenyCodes)`. Fail-closed; never
  throws.
- **`lib/pipeline-authorization/policy.ts`** — versioned `ap-1` registry for the initial capability set (DECLARE of
  DILIGENCE_COMPLETE / CLEAR_TO_CLOSE / TRANSACTION_CLOSED.{CASH,THIRD_PARTY_FINANCED,ASSIGNMENT}); archetype
  policies selected by `policyId`.
- **`lib/pipeline-authorization/commit-guard.ts`** — `revalidateForCommit` (AUTH-INV-14): reruns the canonical
  components (rebuild FactGraph → re-evaluate required predicate via the one evaluator → recompute `authorize`),
  compares `decisionId`, rejects a changed state with `STALE_FACT_GRAPH`. Observational; the DB transaction is E6.
- **`scripts/e2e-authorization.mjs`** — `AC-AUTH-*` (16 assertions).

## Corrections (both required by the founder) — applied and verified

1. **Frozen DENY taxonomy** — no renamed/invented codes; only §11a codes surface publicly; detail in structured
   `policyReasons`; canonical ordering keeps `decisionId` stable ([5][6][8]).
2. **Decision vs commit validity** — pure `authorize()` separated from `revalidateForCommit()`; **AUTH-INV-14** (a
   prior ALLOW is never a lock); staleness → `STALE_FACT_GRAPH` ([11]).

## Coverage (AC-AUTH)

Allow [1] · explanation preservation (embedded artifact unchanged, AUTH-INV-13) [2] · failed precondition →
`MISSING_REQUIRED_EVIDENCE` [3] · missing capability → `INSUFFICIENT_CAPABILITY`/`CAPABILITY_NOT_HELD` [4] · wrong
actor class → `INSUFFICIENT_CAPABILITY`/`ACTOR_CLASS_NOT_ALLOWED` [5] · wrong version → `VERSION_MISMATCH` (rule-set +
predicate) [6] · migration → `MIGRATION_NOT_PERMITTED` [7] · canonical accumulation [8] · determinism + target
identity in `decisionId` [9] · archetype allow [10] · commit-guard valid/stale [11].

## Gate (clean worktree)

```
Architecture satisfied            ✓  pure decision + commit guard · frozen codes · {decision,explanation} · scope held (no eval/reconstruct/ledger/projection)
Acceptance scenarios passing       ✓  AC-AUTH 16/16 (Law 11)
Full E2E sweep                     ✓  49/49 (E1 · AC-FG · AC-GI2 · trace · cycle all green)
Traceability complete              ✓  authorize → E3 Design → Authorization Model (AUTH-INV-1..14, §11a) + AuthorizationDecision + EvaluationResult/Artifact contracts → Decision Log
No constitutional violations       ✓  Law 8/13 · AUTH-INV-10/12/13/14 · frozen taxonomy honored · one evaluator reused (not duplicated)
Ready for next epic                ✓  E4 (Projection) can consume EvaluationArtifact + AuthorizationDecision; E6 wires the commit transaction
```
**Build gate:** `tsc` 0 · e2e 49/49 · AC-AUTH 16/16 · unit 73 files · `build:isolated` ok.

## Post-review correction (founder-required, applied)

- **Removed the evidence-name heuristic.** `authorize` no longer inspects `missing[]` strings to guess a DENY code.
  An unsatisfied precondition now maps to the frozen code **declared by policy** — `AuthorizationPolicy.
  preconditionFailureCode` (default `POLICY_PRECONDITION_FAILED`). Authorization performs no business
  interpretation (restores AUTH-INV-12/13). Coverage added: diligence policy → `MISSING_REQUIRED_EVIDENCE`,
  clear-to-close policy → `POLICY_PRECONDITION_FAILED` for the *same* unsatisfied state (proves policy-driven, not
  name-inferred). AC-AUTH now **16/16**.
- **Barrel comment clarified** — `authorize()` does no eval/reconstruct/ledger-read/projection; `revalidateForCommit()`
  *orchestrates* the canonical Builder + one Evaluator for commit-time freshness (no independent algorithm).

## Deviations (disclosed)

- **`EXCLUSIVITY_CONFLICT`** is defined in the taxonomy but not exercised by the initial capability set (no
  exclusivity rule among the first predicates); reserved for when such a rule is added.
- **Commit-guard staleness via `decisionId` comparison** — the fresh `decisionId` encodes the graph fingerprint
  (through `evaluationId`), so any graph/actor/policy change is detected by one identity comparison; an explicit
  `graphFingerprint` accessor was unnecessary.

## State

Branch pushed; **NOT merged** (code-only, no migration). Awaiting E3 acceptance → on acceptance, FF-merge → E4
(Projection).
