# Opportunity Pipeline — Slice 2 Decision Log

> **The single authoritative place for Slice 2's business semantics — decided BEFORE any implementation.**
> Slice 2 runs in four phases: **(1) Decision** (founder-only, this log) → **(2) Workflow Freeze** → **(3)
> Architecture & Acceptance** → **(4) Implementation**. No state model, no code until the relevant decisions are
> **Frozen**. Companion to the [defect register](./OPPORTUNITY_PIPELINE_DEFECT_REGISTER.md) (which records why
> each item exists) and [Slice 1 acceptance](./OPPORTUNITY_PIPELINE_SLICE1_ACCEPTANCE.md).
>
> Each entry records: **Decision ID · Question · Adopted policy · Rationale · Explicit consequences ·
> Invariant(s) · Downstream implications · Status** (Draft → Frozen). **Invariants** are the checkable
> assertions a decision imposes: every implementation, migration, automation rule, report, and UI must satisfy
> them — a violation means the *implementation* is wrong, not the decision.

---

## Governing separation — three independent models (do NOT collapse)

OWN-1 splits this domain into three models that answer **different questions** and must stay independent. Every
later decision, and every future implementation, is expected to preserve this separation:

| Model | Question it answers | Examples |
|---|---|---|
| **1. Business truth** | *What objectively exists?* | signed contract; buyer matched; diligence complete |
| **2. Operational projection** (the stage) | *What should the pipeline display?* | `BUYER_MATCHED` |
| **3. Operational attention** | *What should the team do next?* | finish underwriting; request missing LOI; resolve inconsistent facts |

Collapsing any two of these is the failure mode that produced the original stage-semantics defects. Resist it.

---

## Global fact invariants (candidate — to be formally ratified under OPP-3)

Rules that recurred across fact families and therefore belong at the platform level, not inside any one family.
Individual families **reference** these rather than restating them (which stops families from drifting apart).

- **GI-1 · Historical business facts are append-only.** Retractions, reopenings, corrections, invalidations, and
  supersessions create **linked successor facts** rather than mutating or deleting prior authoritative facts.
  *(Instances already frozen: 1A-INV-3 (diligence), 2.1-INV-6 (buyer match), 2A-INV-3. OPP-3 will lift this to a
  ratified global invariant that every family references.)*
- **GI-2 · Deterministic evaluators follow one universal contract.** A policy-defined deterministic evaluator
  may assert a business fact only under: **(a) explicit per-policy-version opt-in** (policy defines the fact as a
  pure function over authoritative recorded facts — **machine-evaluable**: a *capability*, not merely a
  fully-documented policy; a written policy that still requires judgment does not qualify); **(b) reproducible** (pure function of recorded facts +
  policy version + rule-set version; evaluator identity/version + both versions + timestamp recorded for exact
  replay); **(c) no machine waiver** (exceptions to policy are judgment, human-only); **(d) fail closed** (abstain
  on ambiguity / missing / malformed / unauthorized, raising operational attention — never default to assert);
  **(e) observational** (read/validate/evaluate/emit only — never repair, normalize, infer, or fetch facts,
  create waivers, or rewrite history); **(f) judgment may not assert** (systems performing probabilistic
  inference, interpretation, or discretion may only *recommend*). **Each family answers only two questions: is a
  given fact eligible for deterministic assertion, and under what policy-defined conditions? Everything else
  derives from GI-2.** *(Origin instance: 1B (diligence completion); referenced by 2B (buyer match). OPP-3 to
  ratify.)*
- **GI-3 · Authoritative business facts belong to distinct semantic classes with different assertion rules.**
  Promoted after **four** independent domains showed the same structure (diligence, buyer match, LOI, executed
  contract). The classes:
  - **Artifact facts** — organization-generated artifacts; usually mechanically assertable (e.g. `LOI_DRAFTED`,
    `CONTRACT_SENT`).
  - **Evidence facts** — faithful recordings of externally-originated events; **captured, never synthesized**
    (e.g. delivery/acceptance/signature evidence).
  - **Decision facts** — authoritative business conclusions; asserted **only** by an authorized principal
    (human, or a GI-2-compliant deterministic evaluator) (e.g. `DILIGENCE_COMPLETE`, `BUYER_MATCHED`,
    `LOI_ACCEPTED`, `CONTRACT_EXECUTED`).

  Structure: *artifact / evidence → decision → projection*; **projection operates exclusively over authoritative
  facts.** The classes are **ordered by what authority may change** — this is the operative rule, not just a
  description:

  | Class | May an authority *create* it? |
  |---|---|
  | Artifact | **Yes** (drafts can be generated) |
  | Evidence | **No — only record it** (signatures cannot be invented; never synthesized or waived into existence) |
  | Decision | **Yes, subject to policy** (execution can be declared) |

  Consequence: **only decision-layer requirements are eligible for discretionary exception; evidence never is.**
  This is why a missing required signature means *not executed* (full stop), while a missing org-internal approval
  can be excepted. *(OPP-3 to formally ratify, alongside GI-1/GI-2.)*

**Watched pattern (NOT yet an invariant).** Recurring structure not yet promoted — hold as candidate, do **not**
freeze:
- **(candidate) Fact-operation authority taxonomy.** The capability shape `RECORD_*_EVIDENCE → DECLARE_* →
  RETRACT_* → CORRECT_HISTORY` (+ policy-gated `ACCEPT_*_EXCEPTION`), with its standard invariants (authority-to-
  fact-ops · attributable+reason · append-only/GI-1 · policy-mapped · exception-≠-policy · same-version/evidence-
  precedes-authority), now recurs across 1A / 2A / 3A. This is an **authority model**, not a single invariant —
  **OPP-3** should consolidate it into one platform capability taxonomy rather than per-family copies.

---

## OWN-1 · What business truth should a pipeline stage represent? · **✅ FROZEN 2026-07-22**

**Question.** Does a stage mean *activity* (what the team is working on), a *business fact* (an artifact exists),
or something else? Until this is settled, any state machine would encode provisional assumptions.

**Adopted policy.**
> A pipeline stage is a **deterministic, total** projection of **authoritative business state**, computed from
> objective business facts. It is **never itself authoritative data**.

Principles:
1. **Business facts are authoritative; stages are projections** derived from those facts.
2. **Stages are never edited directly.** A stage changes only because one or more authoritative facts change.
3. **Stages may legitimately regress.** If an authoritative fact is removed/invalidated, the projected stage
   recalculates accordingly (stages are **non-monotonic**).
4. **Stage ≠ current activity.** "What the team should work on next" is a separate **derived** concept and must
   never be conflated with stage.
5. **Projection uses the *furthest* authoritative fact reached** (not the highest *contiguous* fact). Missing
   intermediate facts do **not** erase later authoritative facts; they create data-quality / workflow
   inconsistencies handled **separately**.
6. **Projection is deterministic and total.** Every combination of authoritative facts (valid *and* invalid)
   resolves to **exactly one** projected stage.

**Rationale.** Only this model keeps two genuinely different questions from contaminating each other —
*what objectively exists* vs. *what the pipeline should show*. "Activity" stages (Option A) let the stage lie
and become an unreliable source of truth; "must-be-a-fact" stages (Option B) make the stage useless for flow.
Projecting from facts eliminates an entire class of synchronization defects and makes reporting/automation
deterministic and auditable. "Furthest fact" is correct because pretending a deal is still at `BUYER_MATCHED`
because an intermediate `LOI` record is missing would make the projection **knowingly inaccurate** when a
contract objectively exists; the right behavior is to project the furthest verified fact **and** separately
surface that the fact graph is inconsistent.

**Explicit consequences (accepted).**
- Three concerns become **independent**: *business truth* ("a signed contract exists"), *data quality* ("earlier
  evidence is missing"), *operational attention* ("someone must resolve this inconsistency"). They must not be
  merged.
- Metrics/automation that assume forward-only motion (time-in-stage, funnel conversion, "advanced to X"
  notifications) must tolerate **regression**.
- The interaction model inverts: users advance the pipeline by **asserting facts** (record LOI, upload executed
  contract, complete diligence), not by setting a stage. A manually-entered stage, if ever wanted, can exist
  only as an explicitly **non-authoritative annotation**.
- Determinism requires the projection be **total** — defined for out-of-order / "impossible" fact combinations
  (e.g. contract present while diligence incomplete): project the furthest fact **and** flag the inconsistency.

**Invariants (checkable — any violation indicts the implementation, not this decision).**
- **INV-1 · Facts are the only authority.** Business facts are the sole source of truth; a stage is never
  authoritative and is never persisted as source-of-truth data.
- **INV-2 · Stage is a pure function of current facts.** Same fact set → same stage. The projection carries no
  history and no momentum, so it recalculates (including **backward**) whenever a fact changes.
- **INV-3 · The projection is total.** Every fact combination — valid *or* invalid — resolves to **exactly one**
  stage.
- **INV-4 · Stage is never written directly.** A stage changes only as a *consequence* of a fact changing;
  there is no authoritative "set stage" operation.
- **INV-5 · Furthest-fact.** The projection selects the furthest authoritative fact reached; a missing
  intermediate fact never suppresses a later fact — it raises a **separate** inconsistency signal instead.
- **INV-6 · Stage carries no activity/attention.** A stage encodes neither "current activity" nor "next
  action"; those live in the separate Operational-attention model.
- **INV-7 · Projection is side-effect free.** Computing the projected stage must **never** create, modify,
  delete, or infer a business fact. The projector reads facts and returns a stage — `facts → projection →
  stage`, never `facts → projection → facts changed`. (Closes INV-2 on the write side: a projector that
  "backfills" a missing intermediate fact would silently violate the furthest-fact rule and the truth/
  data-quality separation.)

*(Ronald's four map in: "facts authoritative" → INV-1; "always a deterministic projection" → INV-2; "never
edited directly" → INV-4; "every combination → exactly one stage" → INV-3. INV-5 = furthest-fact hinge, INV-6 =
activity separation, INV-7 = projection purity / side-effect freedom.)*

**Downstream implications.** Governs **OWN-2** (defines the facts + evidence + the total projection function),
**OWN-3** (PAID projects from a *configured closing policy* fact-set), **OWN-4** (every currently artifact-less
stage needs a backing fact or it cannot be projected), and reframes **OPP-3** (there are no direct ADMIN stage
moves to guard — the guardable actions become fact assertion/retraction and their downstream effects). Retires
the withdrawn "OPP-2 adjacency" framing.

**Status: FROZEN** (Ronald, 2026-07-22). Hinge decision: *furthest authoritative fact reached*.

---

## OWN-2 · Authoritative facts and the projection function · **IN PROGRESS**

**Umbrella question (sharpened by OWN-1).** Enumerate every authoritative business fact, the objective evidence
that establishes each, the **deterministic total projection** (furthest-fact) from fact combinations to exactly
one stage, and how inconsistencies surface **separately**. Worked **one fact family at a time, in business
order**, each fact answering: *what truth · what evidence · who may assert/retract · which stage it projects ·
what inconsistencies coexist · what it does NOT imply.* *(Register origin: stage ⇄ diligence are today a dual,
unsynchronized source of truth — stage `T12_RECEIVED` while `t12` diligence item is `NOT_REQUESTED`, and
vice-versa.)* **Depends on:** OWN-1 (Frozen). **Blocks:** the state-transition model (Phase 3).

### OWN-2 · Decision 1 — Diligence receipt vs. diligence completion · **✅ FROZEN 2026-07-22**

**Question.** Is receiving a diligence document (e.g. a T12) enough to establish that diligence is *complete*?

**Adopted policy (frozen).** Diligence material *receipt* and diligence *completion* are **separate authoritative
facts**.
- **`DILIGENCE_MATERIAL_RECEIVED`** is a **per-required-item** artifact fact: identified source material exists
  and is attached to the opportunity. It proves **possession only** — never accuracy, sufficiency, review,
  acceptance, or completion.
- **`DILIGENCE_COMPLETE`** is a **single, explicit, auditable completion decision made against a specific
  diligence-policy version**. Its evidence includes the authorized actor or approved deterministic seam,
  timestamp, policy version, reviewed-evidence references, outcome, and any explicitly accepted exceptions/waivers.
- The explicit completion decision is **required even when the applicable checklist contains no required items or
  only optional items**. Checklist emptiness, artifact presence, or apparent satisfaction of requirements
  **never independently** establishes completion.
- **Only `DILIGENCE_COMPLETE` may advance the projected pipeline beyond diligence.** Neither receipt nor
  completion may be inferred, synthesized, or backfilled by the stage projector.
- A later **policy change does not retract or rewrite an existing completion decision**. The completion remains
  historically true against its recorded policy version; completion against a superseded policy surfaces
  **separately** as a data-quality / operational-attention condition.

**Invariants (checkable).**
- **D1-INV-1 · Receipt is item-specific.** Receipt state exists independently for every diligence item/artifact
  category; no aggregate receipt boolean substitutes for the item-level facts.
- **D1-INV-2 · Receipt never implies completion.** No quantity/combination of received artifacts establishes
  `DILIGENCE_COMPLETE` without the explicit completion decision.
- **D1-INV-3 · Completion is policy-versioned.** Every completion decision identifies the exact diligence policy
  against which it was made.
- **D1-INV-4 · Policy changes do not rewrite historical facts.** Replacing/amending a diligence policy never
  automatically retracts, mutates, or re-dates an existing completion decision.
- **D1-INV-5 · Empty requirements do not fail open.** An empty, unavailable, or all-optional checklist never
  produces completion by default.
- **D1-INV-6 · Exceptions are explicit evidence.** A completion that depends on waived/unresolved requirements
  must identify the accepted exceptions and the authority that accepted them.
- **D1-INV-7 · Projection does not infer diligence facts.** The stage projector may read receipt and completion
  facts but may never create, infer, repair, or backfill either. *(Instance of OWN-1 INV-7.)*

**Downstream implications.** Diligence-stage projection depends **only** on `DILIGENCE_COMPLETE`; receipt feeds
operational-attention (and possibly a distinct stage — Decision 1C). Opens sub-decisions **1A** (authority),
**1B** (deterministic seam), **1C** (receipt projection). Ties: OPP-1 fail-open lesson → D1-INV-5; OWN-3 policy
versioning; OPP-3 fact-boundary authorization via 1A.

**Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 1A — Diligence fact authority · **✅ FROZEN 2026-07-22**

**Question.** Who may assert, retract, reopen, supersede, or waive diligence facts?

**Adopted policy (frozen).** Authority attaches to **fact operations**, never to stages. 1A freezes the
**capabilities and their semantics**; the **mapping of capabilities to roles is organization policy, not a
domain invariant.** Capabilities (the domain set):
- **`RECORD_ARTIFACT`** — assert a per-item `DILIGENCE_MATERIAL_RECEIVED` (possession) fact.
- **`INVALIDATE_ARTIFACT`** — supersede/retract a receipt fact.
- **`DECLARE_DILIGENCE_COMPLETE`** — assert the `DILIGENCE_COMPLETE` decision.
- **`REOPEN_DILIGENCE`** — supersede/retract a `DILIGENCE_COMPLETE` decision.
- **`ACCEPT_WAIVER`** — waive a required item *within* a completion decision.
- **`CORRECT_HISTORY`** — supersede an erroneous historical fact.

**Domain rule — historical supersession (append-only).** Historical business facts are **never silently
rewritten**. A correction, invalidation, reopening, or waiver-withdrawal creates a **superseding fact linked to
the original**, preserving the original assertion, the correcting actor, timestamp, and reason.

**Invariants.**
- **1A-INV-1 · Authority attaches to fact operations.** Authorization is evaluated for asserting, retracting,
  superseding, or waiving facts — **not** for moving stages.
- **1A-INV-2 · Every authoritative fact operation is attributable.** Every operation records actor (or approved
  deterministic seam), timestamp, and affected fact. Retractions, reopenings, waivers, and corrections
  **additionally require a recorded reason**.
- **1A-INV-3 · Historical facts are append-only.** Corrections, reopenings, invalidations, and supersessions
  never destroy prior facts; they create **linked successor records**.
- **1A-INV-4 · Capabilities are policy-mapped.** The domain defines capabilities; organizations assign them to
  roles through policy.
- **1A-INV-5 · Waivers are stronger than completion.** Accepting a waiver is a distinct business decision
  requiring authority **at least equal to** declaring completion, and policy **may require higher**.

**Deferred (NOT frozen).** The complete capability-order **authorization lattice** (e.g. `RECORD < INVALIDATE <
DECLARE < REOPEN ≤ WAIVE < CORRECT`) is a sensible default but is **not** a universal invariant — it may differ
per fact family (some families have no waiver; correction may be delegated; reopening may be less sensitive than
correction). Freeze the capabilities + semantics now; let the full lattice emerge once **all** fact families are
enumerated. The **only** ordering frozen now is 1A-INV-5 (waiver ≥ completion).

**Downstream.** Feeds **OPP-3** (which generalizes this fact-operation authority model across *all* fact
families rather than reinventing per-fact authority). The **1B** deterministic seam is a *named principal* that
may hold `DECLARE_DILIGENCE_COMPLETE` only under 1B's constraints. **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 1B — Deterministic completion evaluator · **✅ FROZEN 2026-07-22**

**Question.** May a system principal assert `DILIGENCE_COMPLETE`, and under exactly what constraints?

**Adopted policy (frozen — technology-neutral).** The boundary is **judgment-based authority vs. policy-defined
deterministic evaluation**, not "AI/automation vs. code": *if judgment is required, no deterministic evaluator
may assert the fact; if the policy completely specifies the decision, a policy-defined deterministic evaluator
may act as the named principal.* Concretely:
> **Systems that perform probabilistic inference, interpretation, or discretionary judgment may prepare
> recommendations but may NOT assert `DILIGENCE_COMPLETE`. Only a policy-defined deterministic evaluator may do
> so, and only when every invariant of Decision 1B is satisfied.**

A deterministic evaluator may assert completion only when **all** hold: (1) the applicable diligence-policy
version **explicitly authorizes** mechanical completion and defines it as a pure function over recorded facts;
(2) all mandatory facts present + all validation rules pass **with no waiver required**; (3) the result is
**reproducible** from the recorded facts + versions; (4) it **fails closed** on any ambiguity, missing/malformed
fact, or absence of explicit authorization (raising operational attention instead).

**Completion evidence (for a deterministic completion) records — for unambiguous replay:**
`Actor: DeterministicEvaluator:v<n>` · `Policy: DiligencePolicy v<n>` · `RuleSet: CompletionRules v<n>` ·
`Timestamp` · reviewed-evidence references · outcome. *(Policy and executable rules may evolve independently, so
both versions are recorded.)*

**Invariants.**
- **1B-INV-1 · Explicit opt-in.** An evaluator may complete only under a policy version that explicitly
  authorizes mechanical completion; policy silence ⇒ no mechanical completion.
- **1B-INV-2 · Reproducible & deterministic.** Completion is a pure function of recorded facts + **policy
  version + rule-set version**; the same inputs reproduce the exact same result at any later time. The
  completion fact records evaluator identity/version + policy version + rule-set version for replay (audits,
  disputes, regressions, migrations, legal discovery).
- **1B-INV-3 · No machine waiver.** An evaluator may complete only when **no** exception/waiver is required;
  waiving a required item is judgment and requires human authority (1A-INV-5). The mechanical path is
  deliberately narrow — the clean case only.
- **1B-INV-4 · Fail closed.** On ambiguity, missing/malformed facts, or no explicit authorization, the evaluator
  **abstains** and raises operational attention — never defaults to complete (extends D1-INV-5).
- **1B-INV-5 · Judgment may not assert.** Only a policy-defined deterministic evaluator may assert completion;
  systems performing probabilistic inference, interpretation, or discretion may only **prepare recommendations**
  (holds the V2.0 automation-never-owns-authoritative-state line unless a later explicit founder decision moves
  it).
- **1B-INV-6 · Evaluation is observational.** The evaluator may **read, validate, evaluate, and emit** a
  completion decision. It may **not** repair, normalize, infer, or fetch missing facts, create waivers, or
  rewrite history. *(Complements OWN-1 INV-7, which governs the projector: both are observational — each mutates
  business truth only through its single authorized operation.)*

**Downstream.** The evaluator is the 1A `DECLARE_DILIGENCE_COMPLETE` capability held by a **named deterministic
principal**, exercisable only within these constraints. Generalizes (via OPP-3) to any fact family whose policy
defines a mechanically-evaluable assertion. **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 1C — Receipt projection (stage eligibility) · **✅ FROZEN 2026-07-22**

**Question.** Does receiving diligence material establish its own pipeline stage, or affect only operational
attention? — reframed to the more fundamental: **what kinds of facts are eligible to project a stage?**

**Adopted policy (frozen).** `DILIGENCE_MATERIAL_RECEIVED` is authoritative but **non-projecting by default** —
it feeds operational attention, never the stage. A pre-completion stage may exist **only if** it is backed by a
**stable, objective business-state fact that is independently valuable to the business and remains meaningful
regardless of who is currently working the opportunity.** "All required materials received" is an excellent
**instance** of such a fact — but it is an instance of the rule, **not the rule itself** (1C must not constrain
future fact families). Whether to enumerate any such stage is a stage-set/product choice **deferred to OWN-4**;
1C freezes the **eligibility criterion**, not the stage list.

**Invariants.**
- **1C-INV-1 · Receipt is non-projecting by default.** Recording or receiving an artifact affects operational
  attention, not stage projection.
- **1C-INV-2 · Stages require stable state facts.** Every projected stage must be backed by a stable, objective
  business-state fact rather than an activity or transient workflow condition.
- **1C-INV-3 · Stage eligibility is fact-based.** Whether a fact receives its own stage depends on whether it
  represents a meaningful business-state boundary — not implementation convenience or UI preference.

**Downstream.** Gives **OWN-4** a principled test for which facts deserve visible stages (a fact earns a stage
iff it is a stable, independently-valuable business-state boundary). Applies to **every** fact family, not just
diligence. **Status: FROZEN** (Ronald, 2026-07-22).

> **➡ Diligence fact family COMPLETE** — Decision 1 (receipt vs. completion) · 1A (authority) · 1B (deterministic
> evaluator) · 1C (projection eligibility) all frozen. Next fact family: **Buyer Match (Fact 2)**.

---

## OWN-2 · Fact 2 — Buyer Match

**Umbrella question.** When is an opportunity objectively **buyer-matched**? Decomposition mirrors diligence:
possession → (policy-relative) qualification → authoritative decision.

### OWN-2 · Decision 2.1 — Buyer-match fact decomposition & semantics · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Three separate authoritative facts:
- **`BUYER_CANDIDATE_IDENTIFIED`** records that a buyer has been **associated** with the opportunity as a
  potential counterparty. (Possession; proves association only.)
- **`BUYER_QUALIFIED`** records that the **buyer–opportunity pair satisfies the organization's buyer-selection
  policy for the current policy version.** Qualification is a property of *(buyer + opportunity + policy)*, **not**
  an intrinsic buyer trait — structurally identical to policy-relative diligence completion.
- **`BUYER_MATCHED`** records the authoritative business fact that **both parties have mutually assented to
  pursue the opportunity together as the intended counterparty** — *mutual pursuit, not legal commitment*:
  it implies **neither** an LOI, a contract, nor any legally binding obligation.

**Invariants.**
- **2.1-INV-1 · Candidate is non-exclusive.** Multiple candidates may exist simultaneously.
- **2.1-INV-2 · Qualification is policy-relative.** Evaluated against the buyer, the opportunity, and the current
  qualification-policy version.
- **2.1-INV-3 · Matching is exclusive unless explicitly configured otherwise.** At any moment there is **at most
  one** authoritative `BUYER_MATCHED` fact per opportunity, unless organizational policy explicitly permits
  multiple matched counterparties (first-class parallel negotiation).
- **2.1-INV-4 · Match requires mutual assent.** Internal designation alone never establishes `BUYER_MATCHED`.
- **2.1-INV-5 · Match is not commitment.** `BUYER_MATCHED` implies neither an LOI, a contract, nor a legal
  obligation.
- **2.1-INV-6 · Retraction preserves history.** A withdrawn or declined match **supersedes** the prior match
  fact without deleting it (consistent with 1A-INV-3).

**Clarifying notes (consistent with the decision).**
- **Evidence of assent.** `BUYER_MATCHED`'s evidence must include a **record of the buyer's affirmative
  acceptance** of being the intended counterparty for *this* opportunity — not merely an internal assertion. That
  recorded acceptance is what distinguishes it from `BUYER_CANDIDATE_IDENTIFIED` and makes 2.1-INV-4 auditable.
- **Projection vs. exclusivity.** The projector maps *"≥ 1 authoritative `BUYER_MATCHED` fact"* → the
  `BUYER_MATCHED` stage; 2.1-INV-3's exclusivity is a **fact-integrity / authority** constraint on how many match
  facts may exist, **not** projection logic. Permitting multiple matches never changes the projected stage — it
  changes data integrity and operational attention.

**Downstream.** `BUYER_MATCHED` is the completion-equivalent that projects the `BUYER_MATCHED` stage (subject to
2C). Boundary held: the LOI is **Fact 3**, not part of the match. Opens **2A** (authority), **2B** (deterministic
evaluation applicability), **2C** (projection eligibility). **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 2A — Buyer-match fact authority · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Authority attaches to **fact operations** (never stages). Freezes capabilities +
semantics; capability→role mapping is organization policy. Capabilities:
- **`IDENTIFY_CANDIDATE`** — assert `BUYER_CANDIDATE_IDENTIFIED`.
- **`ASSERT_QUALIFICATION`** — assert `BUYER_QUALIFIED` (buyer–opportunity pair vs. the current policy version).
- **`RECORD_ACCEPTANCE_EVIDENCE`** — record an **attributable acceptance-evidence fact**. Authorizes recording
  *evidence*, **not** asserting that the buyer accepted. Evidence may originate from a buyer portal, signed
  email, recorded call, CRM integration, external marketplace, or API; the authoritative acceptance fact is
  established according to the organization's **evidence policy**.
- **`DECLARE_MATCH`** — assert `BUYER_MATCHED` (may fire **only** when an attributable acceptance-evidence fact
  exists — 2A-INV-5).
- **`RETRACT_MATCH`** — supersede/decline a `BUYER_MATCHED` fact.
- **`ACCEPT_QUALIFICATION_WAIVER`** — **accept an exception to the qualification policy** for this
  buyer–opportunity pair. An **independently recorded fact** authorizing proceeding *despite* the qualification
  result. It **never alters or establishes** `BUYER_QUALIFIED` (2A-INV-7). Authority ≥ `DECLARE_MATCH`; recorded
  with reason.
- **`CORRECT_HISTORY`** — supersede an erroneous buyer-match fact.

**Acceptance-evidence rule (frozen, model-neutral).** `BUYER_MATCHED` requires **an attributable acceptance
record whose source satisfies organizational evidence policy** — *not* specifically a portal, email, or call.
This keeps the domain independent of product evolution.

**Invariants.**
- **2A-INV-1 · Authority attaches to fact operations** (not stage moves).
- **2A-INV-2 · Attributable + reason.** Every operation records actor/seam + timestamp + affected fact;
  retract/decline, waiver, and correction additionally require a recorded reason.
- **2A-INV-3 · Append-only** — per **GI-1** (historical supersession; linked successor facts, never mutate/delete).
- **2A-INV-4 · Capabilities are policy-mapped** (domain defines capabilities; orgs assign to roles).
- **2A-INV-5 · Match requires recorded acceptance.** `DECLARE_MATCH` may not assert `BUYER_MATCHED` unless an
  attributable acceptance-evidence fact exists whose source satisfies the org's evidence policy (enforces
  2.1-INV-4 at the authority boundary).
- **2A-INV-6 · Evidence precedes authority.** No authoritative buyer-match operation may depend on evidence that
  has not itself been recorded as an authoritative business fact. *(Evidence → acceptance-evidence fact →
  `BUYER_MATCHED`; never "match now, document later.")*
- **2A-INV-7 · Qualification exception ≠ qualification.** `ACCEPT_QUALIFICATION_WAIVER` never alters or
  establishes `BUYER_QUALIFIED`; it is a distinct fact authorizing progress despite the qualification result —
  preserving "qualified normally" vs. "proceeded on exception" analytics.

**Deferred (NOT frozen).** Full capability-order lattice (per the 1A deferral) — only "waiver ≥ match" is fixed
now (mirrors 1A-INV-5). **Downstream.** Feeds OPP-3 (generalizes fact-operation authority across families; ratifies
GI-1). **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 2B — Deterministic evaluation applicability (buyer-match) · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** The deterministic-evaluator contract is **GI-2** (referenced, not restated). 2B
answers only *which* buyer-match facts are eligible and *under what conditions*:

| Fact | Deterministic assertion? |
|---|---|
| `BUYER_QUALIFIED` | **Yes — conditionally.** Only if the qualification-policy version **completely specifies** qualification as a deterministic evaluation over authoritative recorded facts. Otherwise it remains a **human** decision. |
| `BUYER_MATCHED` | **No, by default.** **Negotiated matching defaults to human authority.** A deterministic evaluator may assert it **only** if *matching is designed into the business model itself* (e.g. marketplace auto-allocation, round-robin assignment, contractually predetermined routing) **and** explicitly authorized by policy — then under full GI-2 **and** the acceptance-evidence prerequisite (2A-INV-5). |
| `ACCEPT_QUALIFICATION_WAIVER` | **Never.** An exception to policy is by definition outside the deterministic policy. |

**Invariants.**
- **2B-INV-1 · Deterministic assertion follows GI-2** for every mechanically-asserted buyer-match fact.
- **2B-INV-2 · Qualification is deterministic only under complete policy specification** (else human).
- **2B-INV-3 · Matching is human by default.** Deterministic matching must be **explicitly designed into the
  business model** and explicitly authorized by policy — negotiated selection is judgment.
- **2B-INV-4 · Waivers are never deterministic.**
- **2B-INV-5 · Evidence capture is not decision.** *Systems may faithfully record externally originated events;
  they may not synthesize, infer, or attribute external intent or assent that was never objectively recorded.*
  Automated recording of acceptance evidence never asserts `BUYER_MATCHED` (which still requires `DECLARE_MATCH`
  under 2A-INV-5). *(Likely a component of the watched candidate GI-3.)*

**Downstream.** Confirms GI-2 as a reusable contract; 2B-INV-5 is the first frozen instance of the
external-evidence-vs-fact distinction watched as GI-3. **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 2C — Buyer-match projection eligibility · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Applying 1C-INV-3 to this family: **only `BUYER_MATCHED` projects a stage.** All
other buyer-match facts are non-projecting and feed operational attention. Projection maps *"≥ 1 authoritative
`BUYER_MATCHED` fact"* → the `BUYER_MATCHED` stage. `BUYER_QUALIFIED` is non-projecting because it answers "*can*
this buyer pursue this deal under policy" (a permission question), **not** "has the opportunity crossed a new
business-state boundary." Whether a pre-match stage ("in-market / buyers engaged") should exist is a fact-based
product choice **deferred to OWN-4**.

**Invariants.**
- **2C-INV-1 · Only `BUYER_MATCHED` projects, by default.** `BUYER_CANDIDATE_IDENTIFIED`, `BUYER_QUALIFIED`,
  qualification waivers, and acceptance-evidence facts remain operational-attention facts unless a future
  decision establishes a stable business-state boundary satisfying the OWN-1 / 1C criteria.
- **2C-INV-2 · Any additional buyer stage requires a new state fact.** If the business later introduces an
  intermediate buyer stage, it must be backed by a **new** stable, independently-valuable business-state fact —
  not by candidate count, qualification count, or user activity.

**Status: FROZEN** (Ronald, 2026-07-22).

> **➡ Buyer-Match fact family COMPLETE** — Decision 2.1 (decomposition/semantics) · 2A (authority) · 2B
> (deterministic-eval applicability) · 2C (projection eligibility) all frozen. Next fact family: **LOI (Fact 3)**.

---

## OWN-2 · Fact 3 — Letter of Intent (LOI)

**Umbrella question.** What authoritative business truth does an LOI establish? An LOI is a **negotiated
artifact**, so the family is inherently **versioned** (counter-offers are the norm).

### OWN-2 · Decision 3.1 — LOI fact decomposition & semantics · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Four facts:
- **`LOI_DRAFTED`** — a draft LOI (version) exists. Preparation, not agreement. **Non-projecting.**
- **`LOI_SENT`** — a specific LOI **version** was transmitted to the intended counterparty (one-sided action;
  evidence: version identity, sender, timestamp, delivery record if available). **Non-projecting.**
- **`LOI_DELIVERED`** — the counterparty received / delivery was confirmed (**model-neutral**: an attributable
  delivery-evidence record whose source satisfies org evidence policy). Evidence, not agreement. **Non-projecting.**
- **`LOI_ACCEPTED`** — both parties have assented to the terms of a **specific LOI version**. **Projects** the LOI
  stage. Requires: the **accepted version identity** + an attributable counterparty-acceptance record (per org
  evidence policy) + both parties' assent to that same version. A **counter-offer is a new `LOI_DRAFTED`/`LOI_SENT`
  cycle for a new version** — never acceptance of the prior. Establishes **mutual agreed intent over the identified
  terms** and implies **no** executed contract, closing, or payment.

Version anchoring continues the family discipline: diligence → policy version, buyer qualification →
qualification-policy version, **LOI → artifact version**.

**Invariants.**
- **3.1-INV-1 · Acceptance is version-specific.** Every `LOI_ACCEPTED` fact identifies exactly one LOI version;
  acceptance never floats across versions.
- **3.1-INV-2 · Acceptance does not propagate.** Acceptance of version N implies nothing about any other version;
  each version stands independently.
- **3.1-INV-3 · Same-version mutual assent.** `LOI_ACCEPTED` establishes that **both** parties assented to the
  **same identified** version; how each party's assent is evidenced depends on who authored that version.
- **3.1-INV-4 · Counter-offer creates a new version** — a new draft/sent cycle; never a modification of a prior
  acceptance.
- **3.1-INV-5 · Only `LOI_ACCEPTED` projects.** `LOI_DRAFTED`/`LOI_SENT`/`LOI_DELIVERED` are non-projecting
  (operational attention + audit). *(Formalized in 3C.)*
- **3.1-INV-6 · Acceptance ≠ commitment.** `LOI_ACCEPTED` implies no executed contract, closing, or payment.
- **3.1-INV-7 · Evidence capture is distinct** (per GI-2 / 2B-INV-5). Automated capture of acceptance/delivery
  evidence never asserts `LOI_ACCEPTED`; the declaration happens at the fact boundary.

**Downstream.** `LOI_ACCEPTED` is "further" than `BUYER_MATCHED` (furthest-fact): an imported deal with an
accepted LOI but no recorded match projects the LOI stage **and** surfaces the missing-earlier-fact inconsistency
(OWN-1 INV-5) — no special logic. **GI-3** (external event → evidence → fact → projection) now has its **third**
instance (LOI delivery/acceptance evidence → `LOI_ACCEPTED`) — still *watched*; promote after the contract family.
Opens **3A** (authority), **3B** (deterministic-eval applicability); **3C** (projection) is effectively ruled by
3.1-INV-5 (a separate 3C is needed only if OWN-4 introduces a pre-acceptance LOI stage). **Status: FROZEN**
(Ronald, 2026-07-22).

### OWN-2 · Decision 3A — LOI fact authority · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Authority attaches to fact operations; freeze capabilities + semantics; role-map is
org policy. Capabilities:
- **`DRAFT_LOI`** — assert `LOI_DRAFTED` (a new version).
- **`RECORD_LOI_SENT`** — assert `LOI_SENT`.
- **`RECORD_DELIVERY_EVIDENCE`** — assert `LOI_DELIVERED` (model-neutral).
- **`RECORD_ACCEPTANCE_EVIDENCE`** — record counterparty acceptance evidence (**same cross-family capability as
  2A**).
- **`DECLARE_LOI_ACCEPTED`** — assert `LOI_ACCEPTED` (only when same-version acceptance evidence + our-side assent
  exist — 3A-INV-1).
- **`RETRACT_LOI_ACCEPTANCE`** — supersede a `LOI_ACCEPTED` fact.
- **`ACCEPT_LOI_TERMS_EXCEPTION`** *(policy-gated)* — authorize proceeding with an accepted LOI whose terms fall
  **outside the organization's defined LOI policy guardrail** for this opportunity. Independently recorded,
  attributable, with reason; authority ≥ `DECLARE_LOI_ACCEPTED`. It does **not** redefine standard terms, make the
  LOI "standard," or alter policy (3A-INV-2). Exists **only** when the org has adopted LOI policy guardrails.
- **`CORRECT_HISTORY`** — supersede an erroneous LOI fact.

**Template deviation vs. policy exception (frozen distinction).** **Deviation from a template** (counterparty
negotiation, counsel revisions, market conditions) is **ordinary negotiation — not an exception.** An exception
exists **only** when accepted terms violate an **explicitly adopted organizational policy guardrail.**

**Invariants.**
- **3A-INV-1 · Same-version evidence precedes authority.** `DECLARE_LOI_ACCEPTED` may assert `LOI_ACCEPTED` only
  when acceptance evidence exists for that **exact LOI version**.
- **3A-INV-2 · Policy exception does not redefine policy.** `ACCEPT_LOI_TERMS_EXCEPTION` authorizes a specific LOI
  despite policy; it does not modify the underlying LOI policy or transform the accepted terms into the new
  organizational standard.
- **(Inherited)** the standard fact-operation authority invariants — authority attaches to fact operations;
  attributable + reason on retract/exception/correct; **append-only via GI-1**; capabilities policy-mapped. These
  now recur across 1A / 2A / 3A and are a **candidate for consolidation into a platform capability taxonomy under
  OPP-3** (watched — see below).

**Downstream.** Feeds OPP-3 (the fact-operation authority taxonomy). **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 3B — Deterministic-eval applicability (LOI) · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** References **GI-2**; answers only which LOI facts are eligible and under what
conditions:

| Fact | Deterministic assertion? |
|---|---|
| `LOI_DRAFTED` | **Yes** — artifact generation, no business judgment. |
| `LOI_SENT` | **Yes** — recording an observable transmission event. |
| `LOI_DELIVERED` | **Yes** — delivery-evidence capture; observational (2B-INV-5). |
| `LOI_ACCEPTED` | **Judgment by default;** deterministic **only** under an explicitly authorized deterministic-acceptance policy (3B-INV-3). |
| `ACCEPT_LOI_TERMS_EXCEPTION` | **Never** — an exception to policy is outside the deterministic policy. |

**Invariants.**
- **3B-INV-1 · Deterministic assertion follows GI-2** for every mechanically-asserted LOI fact.
- **3B-INV-2 · Draft / send / deliver are mechanical** — artifact generation + evidence capture, never business
  judgment; `LOI_DELIVERED` capture never asserts `LOI_ACCEPTED` (2B-INV-5).
- **3B-INV-3 · Acceptance is deterministic only for policy-defined deterministic LOIs.** A deterministic
  evaluator may assert `LOI_ACCEPTED` only when the accepted version **satisfies an explicitly authorized
  deterministic-acceptance policy**, same-version acceptance evidence exists, and all GI-2 conditions are met.
  Any negotiated, discretionary, or policy-nonconforming acceptance requires human authority. *(Implementation-
  independent: byte-identical / canonicalized / structured-model / clause-by-clause validation are all valid
  ways to prove conformance — the business rule is deterministic **policy conformance**, not a particular method.)*
- **3B-INV-4 · Terms exceptions are never deterministic.**

**Downstream.** First family where a **decision** fact has a legitimate (narrow) mechanical path — GI-2 absorbs it
with no special-casing (opt-in + reproducible + fail-closed do the work). **Status: FROZEN** (Ronald, 2026-07-22).

> **➡ LOI fact family COMPLETE** — Decision 3.1 (versioned decomposition/semantics) · 3A (authority) · 3B
> (deterministic-eval applicability) all frozen; 3C (projection) ruled by 3.1-INV-5 (only `LOI_ACCEPTED` projects).
> Next fact family: **Executed Contract (Fact 4)** — the decisive GI-3 test, and the first crossing into binding
> commitment.

---

## OWN-2 · Fact 4 — Executed Contract

**Umbrella question.** What authoritative business truth does an executed contract establish? This family is the
**first crossing into binding commitment**, and cleanly exhibits the three-class structure (now **GI-3**).

### OWN-2 · Decision 4.1 — Executed-contract fact decomposition & semantics · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Four facts (by GI-3 class):
- **`CONTRACT_DRAFTED`** *(artifact)* — a draft purchase contract **version** exists. **Non-projecting.**
- **`CONTRACT_SENT`** *(artifact/action)* — a specific version was transmitted for signature. **Non-projecting.**
- **`CONTRACT_EXECUTION_EVIDENCE`** *(evidence)* — per-party signature/approval evidence (buyer-signed,
  seller-signed, …); captured, never synthesized. **Non-projecting** (partial signatures live here).
- **`CONTRACT_EXECUTED`** *(decision)* — **every signature or approval required by the governing execution policy
  for that specific contract version has been validly obtained.** **Projects `UNDER_CONTRACT`.**

`CONTRACT_EXECUTED` establishes a **binding agreement to transact a specific version.** It does **not** imply that
contingencies are satisfied, escrow/funding is complete, closing has occurred, or payment has been made — each of
those is its **own** downstream authoritative fact. **Executed ≠ contingencies ≠ escrow ≠ funding ≠ closed ≠
paid.** Redlines create a **new version** (never modify a prior execution).

**Invariants.**
- **4.1-INV-1 · Execution is version-specific.** Every `CONTRACT_EXECUTED` fact references exactly one contract
  version.
- **4.1-INV-2 · Execution never propagates.** Execution of version N says nothing about any other version.
- **4.1-INV-3 · Execution is policy-relative.** *Which* signatures/approvals constitute execution is determined by
  the governing execution policy for that version (buyer/seller/broker/attorney/witness/notary vary by org).
- **4.1-INV-4 · Partial execution is evidence, not execution.** Partial signatures are
  `CONTRACT_EXECUTION_EVIDENCE`; they never establish `CONTRACT_EXECUTED`.
- **4.1-INV-5 · Executed ≠ downstream.** `CONTRACT_EXECUTED` implies no contingency satisfaction, escrow, funding,
  closing, or payment; each is its own fact/family. *(Protects OWN-3 + the closing family from being absorbed.)*
- **4.1-INV-6 · Only `CONTRACT_EXECUTED` projects** (`UNDER_CONTRACT`). *(Formalized in 4C.)*

**Deterministic path (defer detail to 4B).** Judgment by default; deterministic **only** when the governing
execution policy completely specifies execution requirements, all required execution evidence for the identified
version exists, and all GI-2 conditions are satisfied (implementation-independent — per 3B-INV-3).

**Downstream.** The binding-but-not-closed boundary (4.1-INV-5) is what keeps **Fact 5 (closing family)** and
**OWN-3 (PAID = configured closing policy)** semantically independent. Opens **4A** (authority), **4B**
(deterministic-eval), **4C** (projection). **Fourth GI-3 instance — GI-3 now promoted to a global invariant.**
**Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 4A — Executed-contract fact authority · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Authority attaches to fact operations; freeze capabilities + semantics; role-map is
org policy. Capabilities: **`DRAFT_CONTRACT`** (assert `CONTRACT_DRAFTED`, new version) · **`RECORD_CONTRACT_SENT`**
· **`RECORD_EXECUTION_EVIDENCE`** (per-party signature/approval evidence; cross-family `RECORD_*_EVIDENCE`) ·
**`DECLARE_CONTRACT_EXECUTED`** · **`RETRACT_CONTRACT_EXECUTION`** · **`CORRECT_HISTORY`** · **`ACCEPT_EXECUTION_
EXCEPTION`** *(policy-gated)*.

**`ACCEPT_EXECUTION_EXCEPTION` (frozen scope).** Authorizes proceeding despite an **unmet organization-defined
execution-policy requirement** (internal legal review, risk/manager/compliance approval). It explicitly does
**not** authorize proceeding despite **missing legally-required execution evidence**. This is the clean split
between **law** (external evidence — non-waivable) and **organizational governance** (decision-layer — exceptable),
made possible by GI-3's authority-mutability ordering.

**Invariants.**
- **4A-INV-1 · Same-version execution evidence precedes authority.** `DECLARE_CONTRACT_EXECUTED` may assert only
  when all policy-required execution evidence exists **for that exact version**.
- **4A-INV-2 · Exceptions may never substitute for missing required external execution evidence.**
  `ACCEPT_EXECUTION_EXCEPTION` may relax only an org-internal requirement; it can **never** stand in for missing
  **required external execution evidence** (signatures, statutory filing acknowledgements, mandated e-execution
  certificates, jurisdiction-specific execution artifacts, …) — non-synthesizable per GI-3.
- **4A-INV-3 · Exception does not redefine policy** (the 3A-INV-2 / 2A-INV-7 pattern).
- **4A-INV-4 · Evidence completeness precedes execution authority.** **No** principal — human or deterministic —
  may assert `CONTRACT_EXECUTED` until **every** required external execution-evidence fact exists. This is an
  **architectural prerequisite**, stronger than "the declaration requires evidence."

**Downstream.** Feeds OPP-3 (fact-operation authority taxonomy). Sharpest illustration of GI-3 as *policy*: the
evidence class is what makes required external execution non-waivable; the decision class is where discretion
legitimately lives. **Status: FROZEN** (Ronald, 2026-07-22).

### OWN-2 · Decision 4B — Deterministic-eval applicability (executed contract) · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** References **GI-2**. GI-3 (*what class of fact*) and GI-2 (*may an evaluator assert
it*) are orthogonal — this family shows the separation cleanly. Per-fact:

| Fact | Deterministic assertion? |
|---|---|
| `CONTRACT_DRAFTED` | **Yes** — artifact generation. |
| `CONTRACT_SENT` | **Yes** — recording an observable transmission. |
| `CONTRACT_EXECUTION_EVIDENCE` | **Yes** — evidence capture (GI-3 evidence class: captured, never synthesized). |
| `CONTRACT_EXECUTED` | **Judgment by default;** deterministic only when execution is machine-evaluable **and** evidence is complete (4B-INV-3). |
| `ACCEPT_EXECUTION_EXCEPTION` | **Never** — an exception is judgment. |

`CONTRACT_EXECUTED` is the **cleanest mechanical decision-fact case** in the pipeline (execution is
evidence-driven), yet still fully bound by 4A-INV-4 and GI-3.

**Invariants.**
- **4B-INV-1 · Deterministic assertion follows GI-2.**
- **4B-INV-2 · Draft / send / evidence-capture are mechanical** (artifact + evidence classes).
- **4B-INV-3 · Execution is deterministic only under a machine-evaluable policy + evidence completeness.** A
  deterministic evaluator may assert `CONTRACT_EXECUTED` only when the governing execution policy is **explicitly
  defined as machine-evaluable** for that contract version (*machine-evaluable = capability, not merely fully
  documented*), **every** required external execution-evidence fact exists, and all GI-2 conditions are satisfied.
  Implementation-independent (per 3B-INV-3).
- **4B-INV-4 · Execution exceptions are never deterministic.**
- **4B-INV-5 · Deterministic execution never upgrades evidence.** An evaluator may go *evidence-complete →
  executed*; it may **never** treat *evidence-incomplete as complete*. (Complements 4A-INV-4.)

**Downstream.** **4C** (projection) is ruled by **4.1-INV-6** (only `CONTRACT_EXECUTED` projects `UNDER_CONTRACT`).
**Status: FROZEN** (Ronald, 2026-07-22).

> **➡ Executed-Contract fact family COMPLETE** — 4.1 (decomposition/semantics + binding boundary) · 4A (authority)
> · 4B (deterministic-eval); 4C ruled by 4.1-INV-6. **Four fact families now complete** (diligence · buyer match ·
> LOI · executed contract), each with semantics/authority/deterministic-applicability/projection. Next: **Closing /
> PAID (Fact 5)** — the first **policy-configured** family; OWN-3 joins here.

---

## OWN-2 · Fact 5 — Closing / PAID (the first policy-configured family)

**Umbrella question.** Given everything that happened, *has the organization's policy declared the transaction
complete?* This is a **higher-order decision** — a policy evaluation over a graph of facts — which is why **OWN-3
belongs here**, not earlier. It marks the platform's shift from **fact modeling → policy composition.**

### OWN-2 · Decision 5.1 — Closing fact ontology + `TRANSACTION_CLOSED` semantics · **✅ FROZEN 2026-07-22**

**Adopted policy (frozen).** Closing facts are objective, authoritative business facts describing the **full
closing lifecycle** — a **core ontology** that is *not* limited by today's V1.4 modules. Each org / deal type
references a **subset** via policy (OWN-3). Enumeration (by GI-3 class; grounded in V1.4 where it exists):

| Closing fact(s) | GI-3 class | V1.4 domain |
|---|---|---|
| `ESCROW_OPENED` · `EARNEST_DEPOSITED` · `ESCROW_RELEASED`/`REFUNDED`/`FORFEITED` | evidence/decision | `EscrowStatus` |
| `FINANCING_COMMITTED` · `FINANCING_CLEARED` · `FINANCING_FUNDED` (·`DENIED`/`WITHDRAWN`) | decision (+funding evidence) | `FinancingStatus` |
| `ASSIGNMENT_DRAFTED` · `ASSIGNMENT_EXECUTED` (·`CANCELLED`) | artifact / decision | `AssignmentStatus` |
| `CONTINGENCY_REMOVED` (per contingency) | decision | escrow contingency deadlines |
| `CHECKLIST_ITEM_SATISFIED` (per required item) | evidence/decision | `ClosingChecklist` |
| **`SETTLEMENT_COMPLETED`** · **`DEED_RECORDED`** · **`FUNDS_DISBURSED`** | decision / evidence | **new — first-class now** (universally available, optionally referenced by policy, exactly like financing) |

**`TRANSACTION_CLOSED`** is an **authoritative, policy-relative decision fact** declaring that *the organization's
configured closing policy for this transaction type has been satisfied.* The **decision is authoritative; the
policy is configurable** — different things. It is structurally identical to `DILIGENCE_COMPLETE`, one layer up. It
**projects the `PAID` stage** — but the **business fact is `TRANSACTION_CLOSED`; `PAID` is only the stage's display
name** (many businesses distinguish closed → funds-disbursed → paid). The architecture:

```
closing facts → configured closing policy → TRANSACTION_CLOSED → PAID stage
   (mirrors: diligence facts → diligence policy → DILIGENCE_COMPLETE → stage)
```

**Invariants.**
- **5.1-INV-1 · Policy evaluates facts, not stages.** The closing policy evaluates closing **facts** (escrow /
  financing / contingency / assignment / checklist / settlement / recording / funding) — **never** the current
  stage. (Keeps policy anchored to business truth, not to an operational projection.)
- **5.1-INV-2 · The fact is not the label.** `TRANSACTION_CLOSED` is the authoritative fact; `PAID` is the
  projected stage's name. The display label is never baked into the ontology.
- **5.1-INV-3 · Closing facts are a universal ontology; the required subset is policy.** Which facts are required
  is the **configured closing policy per transaction type** (OWN-3) — not a property of the facts themselves.

**Downstream.** First move from individual fact modeling into **policy composition** — where a configurable policy
engine belongs. **OWN-3** defines the policy *content* (which subset per deal type: cash / assignment /
seller-finance / subject-to / double-close differ). Opens **5A** (authority — closing facts reuse the frozen
fact-operation taxonomy), **5B** (deterministic-eval — a machine-evaluable closing policy is plausible, per 4B),
**5C** (projection — only `TRANSACTION_CLOSED` projects `PAID`). **Status: FROZEN** (Ronald, 2026-07-22).

---

## OWN-3 · What must be true for PAID? · **DRAFT**

**Question.** Should PAID require Financing/Escrow/Assignment artifacts, or only the due-diligence checklist?
Proposed framing (to ratify): **"PAID = successful completion of the org's *configured closing policy*,"** with
the closing template encoding required artifacts per deal type (cash / assignment / seller-finance / subject-to
/ double-close differ). No hard-coded rule; the OPP-1 fix already makes any added required item enforceable.
**Depends on:** OWN-1. **Status: DRAFT.**

---

## OWN-4 · Stages with no backing artifact · **DRAFT**

**Question.** `INTERESTED_SELLER`, `LOI_SENT`, `UNDER_CONTRACT` currently record facts no object owns (LOI
generation deferred; no executed-contract object; `contractValueUsd` optional). Under OWN-1 a stage cannot be
projected without a backing fact — so this becomes: **define the authoritative fact + evidence behind each such
stage** (e.g. `UNDER_CONTRACT` ⇒ an executed-contract Document), or rule the stage out of the projected set.
**Depends on:** OWN-1, OWN-2. **Status: DRAFT.**

---

## OPP-3 · Guarding disruptive changes · **DRAFT (reframed by OWN-1)**

**Question (reframed).** OPP-1's world had unguarded ADMIN *stage moves* (audited but unwarned; backward moves
don't reverse downstream side effects). Under OWN-1 there are **no direct stage moves** — so the policy question
becomes: should **fact assertions/retractions** that would regress the projected stage (and leave downstream
records — checklist/escrow/financing/assignment — in place) require a **UI confirmation / warning**, and should
any downstream reversal be offered? Every such change remains audited regardless. **Depends on:** OWN-1.
**Also owns:** consolidating the recurring **fact-operation authority taxonomy** (1A + 2A + 3A — `RECORD_*_EVIDENCE
→ DECLARE_* → RETRACT_* → CORRECT_HISTORY` + policy-gated `ACCEPT_*_EXCEPTION`) into **one** platform capability
model, and **formally ratifying the [Global fact invariants](#global-fact-invariants-candidate--to-be-formally-ratified-under-opp-3)** (GI-1 append-only, GI-2 deterministic-evaluator contract, GI-3 fact-class taxonomy — all now stated;
OPP-3 formally ratifies) so every family references one canonical rule instead of per-family copies. **Status: DRAFT.**

---
*Next: open OWN-2 in a dedicated Decision-phase session — authoritative facts, per-fact evidence, and the
deterministic total projection (furthest-fact) with separate inconsistency surfacing. No architecture or code
until OWN-2…OWN-4 + OPP-3 are Frozen.*
