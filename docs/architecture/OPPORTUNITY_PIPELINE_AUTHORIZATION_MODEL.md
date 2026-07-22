# Opportunity Pipeline — Authorization Model (Phase 3.2)

> **Phase 3 · Artifact 3.2. DERIVED, NORMATIVE, implementation-independent.** Derives *who may perform which fact
> operation* from the [Specification §3 (fact-lifecycle authority model)](./BUSINESS_SEMANTICS_SPECIFICATION.md)
> and the [State-Transition Model](./OPPORTUNITY_PIPELINE_STATE_TRANSITION_MODEL.md). Introduces **no new business
> rule**; every clause cites the Spec / Decision Log. Authored 2026-07-22. MUST/MUST NOT/MAY are normative.
>
> **Authorization is evaluated on fact operations only. A stage is NEVER an authorization input or target** (there
> are no stage moves — OWN-1 INV-4).

---

## 1. The authorization-decision function

```
authorize(
    actor,                      # who (with actor type + policy-mapped capabilities)
    capability,                 # which fact-lifecycle capability is being exercised
    factOperation,              # assert | record-evidence | retract | correct | accept-exception | draft
    targetFact + version,       # the fact (+ policy/rule-set/artifact version where applicable)
    organizationPolicy,         # capability→role map + adopted guardrails/predicates
    currentAuthoritativeFactGraph
) → { decision: ALLOW | DENY, reasons[], requirements{ reasonRequired, … } }
```
**Stage MUST NOT appear** as an input or a target (`AUTH-INV-1`). Authorization concerns **business truth**, which
is facts; the stage is a derived projection and is never authorized.

---

## 2. Capability catalog (Spec §3, OPP-3 Part B)

The platform capabilities (the fact lifecycle: `Artifact → Evidence → Decision → Retraction/Correction`), with
their per-family instances:

| Capability | Meaning | Instances |
|---|---|---|
| `DRAFT_*` | create an **artifact** fact | `DRAFT_LOI`, `DRAFT_CONTRACT`, `ASSIGNMENT_DRAFT` |
| `RECORD_*_EVIDENCE` | record external **evidence** (attributable, never synthesized) | `RECORD_ARTIFACT` (diligence), `RECORD_ACCEPTANCE_EVIDENCE`, `RECORD_DELIVERY_EVIDENCE`, `RECORD_EXECUTION_EVIDENCE`, closing evidence (deposit/funding/deed/funds/settlement) |
| `DECLARE_*` | assert a **decision** fact | `DECLARE_DILIGENCE_COMPLETE`, `DECLARE_MATCH`, `DECLARE_LOI_ACCEPTED`, `DECLARE_CONTRACT_EXECUTED`, closing decisions, `DECLARE_CLEAR_TO_CLOSE`, `DECLARE_TRANSACTION_CLOSED` |
| `RETRACT_*` | supersede a **decision** fact | `RETRACT_MATCH`, `RETRACT_LOI_ACCEPTANCE`, `RETRACT_CONTRACT_EXECUTION`, `REOPEN_DILIGENCE`, `RETRACT_TRANSACTION_CLOSED` |
| `INVALIDATE_*` | supersede an **evidence/artifact** fact | `INVALIDATE_ARTIFACT` |
| `CORRECT_HISTORY` | supersede an **erroneous** fact (any class) | `CORRECT_HISTORY` |
| `ACCEPT_*_EXCEPTION` *(policy-gated)* | relax a **decision-layer/org-policy** requirement | `ACCEPT_WAIVER`, `ACCEPT_QUALIFICATION_WAIVER`, `ACCEPT_LOI_TERMS_EXCEPTION`, `ACCEPT_EXECUTION_EXCEPTION`, `ACCEPT_CLOSING_EXCEPTION` |

The **domain defines capabilities**; organizations map them to roles (§6).

---

## 3. Capability × fact-class applicability (GI-3)

The applicable capability is determined by the target fact's **GI-3 class** — this realizes GI-3's
authority-mutability ordering:

| Fact class | May create / assert | May supersede | May NOT |
|---|---|---|---|
| **Artifact** | `DRAFT_*` | `CORRECT_HISTORY` | be recorded as evidence or declared as a decision |
| **Evidence** | *(only)* `RECORD_*_EVIDENCE` — from an attributable source | `INVALIDATE_*`, `CORRECT_HISTORY` | **be `DECLARE`d, synthesized, or exception-waived into existence** (`AUTH-INV-3`) |
| **Decision** | `DECLARE_*` | `RETRACT_*`, `CORRECT_HISTORY` | be asserted without its preconditions (§7) |

`ACCEPT_*_EXCEPTION` applies **only** to decision-layer requirements — never to any evidence fact.

---

## 4. Actor types

| Actor | May exercise | May NOT |
|---|---|---|
| **Human** | any capability their policy-mapped role grants; exercises **judgment** | assert a fact without preconditions; synthesize evidence |
| **External principal** (counterparty via a seam — portal/e-sign) | produce **attributable evidence** (their own act, captured via `RECORD_*_EVIDENCE`) | assert *our* decision facts; the decision remains an internal `DECLARE_*` |
| **Deterministic evaluator** (GI-2 named principal) | `DECLARE_*` a decision **only** under GI-2 (machine-evaluable policy · reproducible · fail-closed · evidence-complete) | exercise judgment, waive, synthesize evidence, or act where policy is not machine-evaluable |
| **Migration principal** | record **migration-origin assertions** only (STM §9c), under explicit audited migration authorization | manufacture evidence; act outside a migration; be mistaken for verified evidence |

These are **actor *classes*, not privilege levels.** Authority is determined by **`Actor + Capability + Policy`**,
**never** by an ordering like `Migration > Human > Evaluator`. The taxonomy MUST NOT be used as an authorization
hierarchy — a migration principal is *narrower* than a human, not "more powerful."

---

## 5. Preconditions per operation class (derived from the frozen guards)

- **`DECLARE_*` (assert a decision).** Actor holds the capability **and** the decision's preconditions hold:
  required facts/evidence exist (**evidence completeness** — 4A-INV-4, 5A-INV-2), for the **exact version**
  (3.1-INV-1, 4.1-INV-1); for a **policy-relative** decision the configured predicate is satisfied (or, for a
  deterministic evaluator, GI-2 holds). Evidence completeness precedes decision authority for **human and
  deterministic principals alike**.
- **`RECORD_*_EVIDENCE`.** Actor holds the capability; evidence is **attributed to its true external source** and
  never synthesized (GI-3, 2B-INV-5).
- **`RETRACT_*` / `INVALIDATE_*` / `CORRECT_HISTORY`.** Actor holds the capability; **recorded reason required**;
  performed as **append-only supersession** — the prior fact is preserved (GI-1); leaves other authoritative facts
  untouched (no cascade — OPP3-INV-1).
- **`ACCEPT_*_EXCEPTION`.** The org has **adopted the guardrail** (policy-gated); scope is **decision-layer/
  org-policy only** — MUST NOT substitute for a missing required evidence fact (§9); authority **≥** the
  corresponding `DECLARE_*`; **recorded reason required**.
- **`DRAFT_*`.** Actor holds the capability (lowest tier; artifact creation).

---

## 6. Policy-defined role mappings

The **domain** fixes the capabilities and their preconditions (this document). The **organization** maps
capabilities → roles as **runtime configuration** (Hierarchy of Authority: a lower layer may *refine* but never
*redefine*). Therefore:
- No capability, precondition, or GI-3 applicability is org-configurable (those are domain invariants).
- Which roles hold which capabilities, and any **elevated authority** for exceptions/corrections, **is** org
  policy. Default tiers exist per family but are org-overridable **upward** (strengthen), never to weaken an
  invariant.

---

## 7. Same-version + evidence-completeness guards

- **Same-version:** a `DECLARE_*` on a version-anchored decision (`LOI_ACCEPTED`, `CONTRACT_EXECUTED`) is authorized
  only when the required evidence exists **for that exact version** (3A-INV-1, 4A-INV-1). A counter/redline is a
  new version and does not satisfy a prior version's decision.
- **Evidence completeness:** `DECLARE_CONTRACT_EXECUTED` / closing decisions are authorized only when **every**
  required external-evidence fact exists (4A-INV-4) in its **required state** (5A-INV-2). This is an **architectural
  precondition**, applied identically to human and deterministic principals.

---

## 8. Exception boundaries (recurring rule, now platform-level)

`ACCEPT_*_EXCEPTION` MAY relax only a **decision-layer / org-policy** requirement. It MUST NOT: substitute for a
missing **required evidence** fact (GI-3 — evidence is non-synthesizable); redefine the policy or become the new
standard; be exercised by a deterministic evaluator (exceptions are judgment). Authority ≥ the corresponding
decision authority. A missing legally-required signature ⇒ **not executed**, never exception (4A-INV-2).

---

## 9. Concurrency authorization behavior

- Authorization is evaluated against the **current committed authoritative fact graph** at operation time. An
  authorization ALLOW computed over a **stale** graph is **invalid** (`AUTH-INV-8`).
- Preconditions MUST be **re-verified at commit**: if a concurrent operation invalidated a precondition (e.g.
  evidence superseded, an exclusive `BUYER_MATCHED` already asserted — 2.1-INV-3) between check and commit, the
  operation MUST be **rejected**, not committed on stale authorization.
- Concurrency MUST preserve **append-only history** and **deterministic active-fact resolution** (STM-INV-2). This
  is the authorization face of open question **A-8**; the persistence/serialization mechanism is deferred there.

---

## 10. Attribution + reason (Spec §3)

Every authoritative operation records **actor (or named seam/evaluator/migration principal) + timestamp + affected
fact**. `RETRACT_*` / `REOPEN` / `ACCEPT_*_EXCEPTION` / `CORRECT_HISTORY` **additionally require a recorded reason**.
Migration-origin assertions are marked as such (never verified evidence).

---

## 11. Authorization-decision result contract (normative)

```
Actor:              user:alice (role: Closer)         | evaluator:closing-policy:v4 | migration:v1
Capability:         DECLARE_TRANSACTION_CLOSED
Fact operation:     assert decision
Target:             TRANSACTION_CLOSED  (archetype: Assignment; policy v7; rule-set v3)
Decision:           DENY
Reasons:            - FUNDS_DISBURSED{purpose:AssignmentFee} is absent (evidence completeness, 5A-INV-2)
                    - archetype 'Assignment' requires it; no exception may substitute (evidence, §8)
Requirements:       reasonRequired = n/a (denied)
```
A compliant API/UI derives its behavior from this contract without prescribing presentation. **The result never
references a stage.** ALLOW results carry `requirements` (e.g. `reasonRequired: true` for retract/exception) that
the guard model (STM §6) uses for the confirmation/impact summary.

### 11a. DENY reason taxonomy (FROZEN — stable contract between API · UI · audit · automation)

Every DENY carries one or more of these stable codes (resolves AZ-5):
`INSUFFICIENT_CAPABILITY` · `MISSING_REQUIRED_EVIDENCE` · `POLICY_PRECONDITION_FAILED` · `VERSION_MISMATCH` ·
`STALE_FACT_GRAPH` · `EXCLUSIVITY_CONFLICT` · `INVALID_EXCEPTION_SCOPE` · `MIGRATION_NOT_PERMITTED` ·
`UNKNOWN_FACT` · `UNKNOWN_OPERATION`.
The acceptance suite asserts the **exact code**, not merely that an operation was denied.

### 11b. The single predicate evaluator (architectural constraint)

There MUST be **exactly one** side-effect-free predicate/precondition evaluator, used by **all** of: authorization
(§7), stage projection (STM §3), policy evaluation (Spec §4), the hypothetical/what-if preview (STM §6), and the
acceptance suite (§3.3). Not four independent implementations. This makes "authorized," "projected," "closed," and
"tested" agree **by construction** (resolves AZ-3; upholds AUTH-INV-10, OWN-1 INV-7, GI-2(e)).

---

## 12. Authorization invariants (each maps to the Spec)

| AUTH invariant | Statement | Derived from |
|---|---|---|
| **AUTH-INV-1** | Authorization is over fact operations, never stages; stage is never an input/target | OWN-1 INV-4; §3 |
| **AUTH-INV-2** | Capability applicability follows the GI-3 fact class | GI-3 |
| **AUTH-INV-3** | Evidence is never authorable — no actor may declare/synthesize/waive an evidence fact; only record it from an attributable source | GI-3; 2B-INV-5; 4A-INV-2 |
| **AUTH-INV-4** | Decision preconditions include same-version + evidence-completeness, for human and deterministic principals alike | 3A-INV-1; 4A-INV-1/INV-4; 5A-INV-2 |
| **AUTH-INV-5** | Deterministic evaluators are authorized only under GI-2 | GI-2 |
| **AUTH-INV-6** | Exceptions relax only decision-layer/org-policy requirements, never evidence; authority ≥ decision authority; reason required | 2A-INV-7; 3A-INV-2; 4A-INV-2 |
| **AUTH-INV-7** | Every authoritative operation is attributable; retract/exception/correct require a recorded reason | 1A-INV-2/3; GI-1 |
| **AUTH-INV-8** | Authorization is over the current committed fact graph; stale-graph authorization is invalid; preconditions re-verified at commit | STM-INV-2/6; 2.1-INV-3 |
| **AUTH-INV-9** | Migration-origin assertions are authorizable only by the migration principal, under explicit migration authorization, and are marked migration-origin | STM §9c; GI-1/GI-3 |
| **AUTH-INV-10** | **Authorization is observational.** `authorize(...)` evaluates the fact graph + policy and returns ALLOW/DENY+reasons only; it MUST NOT create/reserve facts, lock stages, mutate evidence/derived state/caches/config, or start workflows | symmetry with OWN-1 INV-7 (projector) + GI-2(e) (evaluator) |
| **AUTH-INV-11** | **Authorization is commit-valid.** An authorization decision is valid only while its evaluated fact graph remains current; any **stale** authorization MUST be revalidated before commit (stronger than optimistic locking alone) | STM-INV-2/6; §9 |
| **AUTH-INV-12** | **Authorization purity.** `authorize` consumes only `{ AuthorizationPolicy, EvaluationArtifact, Actor, Capability, Operation }`; it never queries the ledger, rebuilds the FactGraph, evaluates predicates independently, or projects stages (complements Laws 12/13) | E3 design §5 |
| **AUTH-INV-13** | **Explanation preservation.** Authorization never rewrites or reinterprets the evaluator's explanation; the `EvaluationArtifact` is embedded unchanged and authz may only *append* permission-specific reasoning | E3 design §5; [AuthorizationDecision Contract](./AUTHORIZATION_DECISION_CONTRACT.md) |
| **AUTH-INV-14** | **Decision vs commit guard.** `authorize()` is a pure decision function; a separate transactional guard revalidates its inputs against current authoritative state (fresh FactGraph + re-evaluation + refreshed actor snapshot) before an authorized fact operation commits, rejecting stale authorization (`STALE_FACT_GRAPH`). A prior ALLOW is never a reservation/lock/durable permission (realizes AUTH-INV-11) | E3 design §1/§6 |

---

## 13. Unresolved-architecture list (3.2 realization questions — NOT semantics)

- **AZ-1 · Capability→role storage.** How is the org's capability→role map represented/configured (and its
  "elevated authority for exceptions/corrections")? (Runtime-config schema; ties to A-4.)
- **AZ-2 · Authorization invocation point.** One authorization entry point invoked before **every** fact operation;
  where does it sit relative to the fact-write transaction (must be same boundary as the commit-time precondition
  re-check — §9, A-3/A-8)?
- **AZ-3 · Precondition evaluation reuse.** ✅ **Resolved as a constraint** (§11b): exactly one side-effect-free
  evaluator serves authorization, projection, policy, what-if, and tests. (*How* it's factored is A-7/A-9.)
- **AZ-4 · Evaluator + migration principal identity.** How are non-human principals (deterministic evaluator,
  migration principal) identified, versioned, and their authorizations scoped/audited (ties A-5)?
- **AZ-5 · Deny reason taxonomy.** ✅ **Resolved — frozen** (§11a). (*How* codes are surfaced through API/UI is
  presentation, deferable.)

---

*Next Phase-3 artifact (after review/acceptance of 3.2): the **acceptance + regression suite** — each Spec/STM/AUTH
invariant → executable scenarios asserting both the projected outcome **and** whether each authoritative operation
was permitted at the correct boundary. No code until Phase 4.*
