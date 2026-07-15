# Underwriting Architecture Lock (Version 1.3 — Commercial Underwriting)

> The canonical, load-bearing architecture for deterministic commercial
> underwriting. This is a **fresh lock**, not an extension of Property Intelligence:
> underwriting is a **read-only consumer** of the completed Version 1.2 platform, not
> a second source of truth. Locked 2026-07-15. See also the [Underwriting Calculation
> Principles](./UNDERWRITING_CALCULATION_PRINCIPLES.md) (the deterministic philosophy
> every formula shares), the [roadmap](../roadmap/VERSION_1_3.md), and the
> [Engineering Playbook](./ENGINEERING_PLAYBOOK.md).

## 1. Mission

Turn the existing pure calculation kernel (`lib/analysis.ts`) into a **governed,
reproducible ownership model**. Version 1.2 established deterministic *information*;
Version 1.3 establishes deterministic *financial-modeling ownership* — trustworthy,
reproducible, and governable — **before** the calculation engine is deepened in
later slices. The math is not made smarter here; its ownership is made rigorous.

## 2. The model

```
Opportunity
    ↓
Underwriting            (1:1 with the Opportunity — the anchor, U-G)
    ↓
Scenario                (immutable lifecycle: DRAFT → LOCKED → SUPERSEDED)
    ↓
Assumptions             (typed rows; MANUAL = analyst, SEEDED = ScenarioSeed snapshot)
    ↓
ScenarioVersion         (deterministic fingerprint of assumptions + ordering + lineage)
    ↓
ScenarioResult          (derived, cached, rebuildable — 1:1 with the Scenario)
```

- **ScenarioSeed** — the deterministic set of defaults imported from Version 1.2 at
  scenario creation, made explicit through `AssumptionSource = SEEDED`, `sourceField`,
  and `sourceAsOf`. It preserves the distinction between *imported defaults* and
  *analyst assumptions*.
- **Model lineage** — `UNDERWRITING_MODEL_VERSION`, `CALCULATION_LIBRARY_VERSION`,
  `RULESET_VERSION` (all `1`), frozen onto every scenario.

## 3. Locked decisions

| Key | Decision |
|---|---|
| U-A | Underwriting is a **read-only consumer** of Version 1.2 — never a second source of truth. |
| U-B | `Underwriting → Scenario[] → Assumption[]`; a Recommendation is split into *suggested* (deterministic) and *decided* (human). |
| U-C | Assumptions are **not** evidence — they never enter the 1.2 Observation/Signal ledger. |
| U-D | Sourced defaults are **snapshotted** at input, not read live. |
| U-E | Calculations are **pure, rebuildable, and versioned**. |
| U-F | The UI is not a calculation engine. |
| U-G | The **Opportunity is the anchor** for an Underwriting. |
| U-H | Documents own reports/exports (offer memo / LOI), not the calc core. |
| U-I | No AI in the deterministic core. |
| U-J | An `UNDERWRITING` RBAC resource governs authoring; `UNDERWRITING_APPROVAL` (deciding a recommendation) is reserved for a later slice. |
| U-K | **Model lineage** = `UNDERWRITING_MODEL_VERSION` + `CALCULATION_LIBRARY_VERSION` + `RULESET_VERSION`. |
| U-L | **ScenarioResult** concept: a Scenario owns assumptions; a ScenarioResult owns the derived calculations, findings, risks, and suggested recommendation. |

## 4. Locked invariants

The load-bearing guarantees. Any change that would violate one is a re-architecture,
not a refactor.

- **UW-1** — No underwriting write ever reaches the 1.2 ledger / identity / resolution.
- **UW-2** — A LOCKED scenario is byte-reproducible from its frozen inputs + lineage.
- **UW-3** — A calculation is always rebuildable — anything not stored can be regenerated.
- **UW-4** — The engine never makes the acquisition / disposition decision.
- **UW-5** — Property facts are snapshotted, never re-owned.
- **UW-6** — The UI never performs authoritative calculations.
- **UW-7** — A recommendation is never an input to a calculation.
- **UW-8** — **Scenario locking freezes meaning, not presentation.** Presentation
  changes (report layout, formatting, graphs) never create a new Scenario. Changes
  to **assumptions, model lineage, rules, or calculation behavior** always require a
  new Scenario version.
- **UW-9** — **ScenarioResult is disposable.** It may always be deleted and
  regenerated from frozen assumptions + model lineage + the calculation kernel. The
  **Scenario itself is never disposable.** (Mirrors Observation → Projection and
  Property → PropertyIdentity: the derived surface is rebuildable; the source is not.)

**Additional lock (Scenario ownership).** *Every deterministic underwriting output
belongs to exactly one Scenario.* Metrics, findings, risks, and the suggested
recommendation never exist independently of a Scenario — enforced structurally
(`ScenarioResult` is 1:1 with a Scenario).

### Debt-sizing invariants (Commit 3b-i)

These are calculation-specific locks for the debt-sizing engine; future calculation
slices add their own alongside them.

- **DS-1 — Every sizing constraint is independently reproducible.** LTV, LTC, and
  DSCR are each a self-contained deterministic calculation, computable in isolation.
  The sized loan is nothing more than `min(` the applicable constraints `)` — never a
  weighted, heuristic, or entangled figure.
- **DS-2 — Binding-constraint selection is fully explainable.** Every persisted
  sizing result preserves **each evaluated constraint, each calculated loan amount,
  and which one bound** (`loanByLtvUsd` / `loanByLtcUsd` / `loanByDscrUsd` /
  `sizedLoanUsd` / `bindingConstraint`). "Why this loan?" is always answerable from
  stored explanatory metadata — not re-derived, not a heuristic.
- **DS-3 — New sizing constraints compose; they never redefine existing ones.**
  Adding a future ceiling (debt yield, maximum payment, sponsor equity, …) only adds
  a term to the selection: the sized loan always remains `min(` all applicable
  deterministic constraints `)`. No existing constraint changes meaning when another
  is added.
- **DS-4 — Every sizing constraint is independent.** Each constraint module computes
  **only its own ceiling** from the scenario's inputs and knows nothing about the
  others — LTV never reads LTC/DSCR or any future constraint. Selection (the `min`)
  happens strictly afterward, over the independently-computed ceilings.

### Schedule invariants (Commit 3b-ii)

- **IS-1 — Income and expense schedules are independently reproducible.** Gross
  income is the deterministic sum of the active **income** line items; operating
  expenses are the deterministic sum of the active **expense** line items. Neither
  total depends on the other — the two roll-ups are computed separately and never
  cross-reference.
- **IS-2 — Schedule presence is explicit.** For each kind independently: a **present**
  schedule supplies the effective total; an **absent** schedule falls back to the
  corresponding scalar assumption; an **explicitly cleared** schedule returns that kind
  to scalar fallback. The engine must never infer schedule presence from a zero total —
  presence is a property of the line-item set, not of its sum.
- **IS-3 — Line-item order is presentation only.** Reordering line items changes
  neither `scenarioVersion`, the effective totals, nor the `ScenarioResult`. Changing a
  line item's **kind**, **category**, **amount**, or **source** does change the
  deterministic Scenario meaning (and therefore the fingerprint). The canonical
  fingerprint sorts by `(kind, category, amount)` and excludes `position`.

### Financing-case invariants (Commit 3b-iii)

A **FinancingCase** is a first-class child of a Scenario representing **one capital
structure** (debt, all-cash, and — later — seller-financing, mezzanine, preferred
equity). The ownership chain is `Scenario (operating) → FinancingCase (capital) →
CashFlow (per-case projection)`. Capital assumptions and every financing-dependent
output were **relocated off the Scenario** onto the FinancingCase — a sanctioned
one-time model correction made while production held zero underwriting rows.

- **CF-1 — Operating and capital ownership are separate.** Every FinancingCase
  shares exactly one operating Scenario. Operating assumptions (rents, expenses,
  growth, hold, purchase, seed) are owned by the **Scenario**; capital assumptions
  (loan, rate, amortization, LTV/LTC/DSCR sizing) are owned by the **FinancingCase**
  (`FinancingAssumption`). Capital ownership never lives in two places.
- **CF-2 — Cash flow belongs to the FinancingCase; NOI belongs to the Scenario.**
  Operating economics and financing economics stay separate: `ScenarioResult` is
  operating-only (NOI, cap rate, price/unit, expense ratio, spread); debt service,
  DSCR, debt yield, debt sizing, and the multi-year cash flow live on
  `FinancingCaseResult` / `CashFlowYear`.
- **CF-3 — Every FinancingCase is independently reproducible.** Its cash flow is a
  pure function of the frozen Scenario operating economics + its own capital
  assumptions + model lineage — never current Property state, never another case.
  Its `financingCaseVersion` fingerprints exactly that dependency.
- **CF-4 — A FinancingCase never changes the operating Scenario.** Cases consume the
  Scenario's frozen operating economics; they never mutate assumptions, schedules,
  NOI, or `ScenarioResult`. Editing the operating side reprices every case; editing
  a case changes only that case.
- **CF-5 — The operating NOI trajectory is computed once and reused identically by
  every FinancingCase.** A case may change debt service, DSCR, and cash flow before
  tax; it may not change the operating income or expense trajectory.

Operating cash flow only (3b-iii): terminal value, exit valuation, refinance,
equity waterfall, IRR, and equity multiple are out of scope and remain future
sub-slices.

### Exit-valuation invariants (Commit 3b-iv)

3b-iv adds the next projection layer on top of the per-case cash flow:
`… → CashFlowYear → Exit Valuation → Equity Cash Flows → Return Metrics`. Exit
*assumptions* (`EXIT_CAP_RATE_PCT`, `SELLING_COSTS_PCT`) are **operating** (Scenario-
owned, financing-independent), so they enter `scenarioVersion` and therefore every
case's `financingCaseVersion`; the exit *outputs* are **per-FinancingCase**. The exit
year is the hold period; terminal NOI is the exit-year projected NOI (trailing). A
**basic** single-holder waterfall only (return of contributed equity, then remaining
profit to the one holder) — no promote, preferred, catch-up, or multiple partners.

- **EX-1 — Exit valuation extends the existing cash-flow projection.** It reads the
  settled operating NOI, debt service, and operating cash flow as frozen inputs and
  never changes them (Principle 8).
- **EX-2 — Terminal value is independently reproducible.** The system persists the
  full set — terminal NOI, exit cap rate, gross exit value, selling costs, debt
  payoff, net sale proceeds — so the valuation is explainable from stored inputs and
  intermediate values.
- **EX-3 — Debt payoff is derived from the FinancingCase's frozen loan terms + exit
  timing** via the true amortization remaining-balance formula (never a shortcut when
  the amortization inputs exist). It never reads current lender or Property state.
- **EX-4 — Equity returns are pure functions of the complete equity cash-flow
  series.** Equity multiple and levered IRR are OUTPUTS only — they never become
  inputs to another calculation.
- **EX-5 — The final year is not double-counted.** The exit-year equity cash flow
  combines that year's operating cash flow with the net sale proceeds exactly once;
  operating cash flow is never counted both in the annual stream and again at exit.
- **EX-6 — Exit and return projections belong to exactly one FinancingCase.** They
  never exist independently of their case.

Scope excludes (future slices): refinancing, multi-tier promotes, preferred returns,
catch-ups, multiple equity partners, tax/depreciation/capital-gains, and approval
workflow. (Sensitivity matrices arrive in 3b-v below; findings/risk flags in 3b-vi.)

### Sensitivity invariants (Commit 3b-v)

3b-v adds a **consumer** layer, not another calculator (Principles 10–11): a
per-FinancingCase `SensitivityAnalysis` re-derives a chosen metric over a deterministic
grid of perturbed inputs and stores only the resulting `SensitivityCell` readings.
Ownership: the spec (metric + one or two axes over a fixed assumption allow-list) and
its derived cells hang off ONE baseline case; the axes are evenly-spaced (≤ 11 values
each, ≤ 121 cells); the target metric is one of a fixed allow-list (default levered
IRR). `sensitivityVersion = f(financingCaseVersion, canonical spec, model lineage)`;
model lineage bumps **v5 → v6**; the new pure module is `lib/underwriting/sensitivity.ts`
(`lib/analysis.ts` unchanged). Overrides are applied to an in-memory COPY of the frozen
assumptions and are **never persisted**.

- **SE-1 — Sensitivity never mutates its baseline.** No cell, axis, or rebuild writes
  back to the Scenario, its FinancingCases, their assumptions, or any persisted
  deterministic result. The dependency arrow is one-way: base → sensitivity.
- **SE-2 — Each SensitivityAnalysis has exactly one immutable baseline FinancingCase.**
  The grid hangs off that case's `financingCaseVersion` (which already folds in the
  operating scenario + capital + lineage), and the baseline cell reproduces the case's
  own metric exactly.
- **SE-3 — Each cell is a pure function** of the frozen Scenario assumptions + the
  frozen FinancingCase assumptions + the cell's explicit axis overrides + model lineage.
  It never reads current Property state, another FinancingCase, or another cell.
- **SE-4 — Cells are disposable and rebuildable, never authoritative inputs.** Delete
  them and they regenerate identically; a no-op rebuild performs zero writes; nothing
  downstream treats a cell as a source of truth.
- **SE-5 — Axis generation is deterministic.** Identical `(min, max, steps)` always
  yield identical ordered values (evenly spaced across the closed interval).
- **SE-6 — The baseline cell is marked only when it is exact.** It is identifiable only
  when the baseline assumption values fall EXACTLY on the generated axes (both axes for
  a two-axis grid). The system never snaps to the nearest cell and labels it baseline.
- **SE-7 — Sensitivity is evaluation, not optimization.** It reports outcomes; it never
  chooses, ranks, recommends, or searches for a "best" cell. Interpretation (findings /
  risks / recommendation) is deferred to Commit 3b-vi.

Scope excludes (deferred): findings, risks, recommendation bands, optimization, solvers,
Monte Carlo, probability distributions, more than two axes, and any mutation of baseline
assumptions.

### Findings / Risks / Suggested-Recommendation invariants (Commit 3b-vi)

3b-vi adds the **top** layer of the stack — interpretation, not calculation. A pure
`lib/underwriting/findings.ts` reads the settled deterministic outputs (operating
`ScenarioResult` + each `FinancingCase`'s financing/exit results) and a **fixed,
versioned ruleset** to emit `ScenarioFinding`s and a single deterministic
`ScenarioRecommendation` (`PROCEED` / `PROCEED_WITH_CONDITIONS` / `PASS`). It is a
**consumer** of the engine, exactly like sensitivity (Principle 10) and strictly
downstream of every metric (Principle 7 / UW-7): findings never feed back into any
calculation, and the engine reports/recommends but never decides (UW-4). Findings belong
to the **Scenario** (they may cite a specific `FinancingCase`); the recommendation is
driven by the *decisive* subset — operating findings + the **primary** case (position 0).

**Fingerprint separation (ratified R-A).** `RULESET_VERSION` is REMOVED from the
deterministic calculation fingerprints (`scenarioVersion`, `financingCaseVersion`,
`sensitivityVersion` now fold only model + calc lineage). A new, separate
`findingsVersion = f(scenarioVersion, all financingCaseVersions, RULESET_VERSION)` keys
the findings layer. This makes a rules-only change reproducible **without** invalidating
any metric, cash flow, valuation, financing result, IRR/waterfall, or sensitivity output
(FR-6). Model lineage bumps to **model 6 / calc 6 / ruleset 2** — a `RULESET_VERSION`
increment ONLY (the kernel and model shape are unchanged).

- **FR-1 — Findings are pure functions of settled underwriting metrics + the versioned
  ruleset.** No clock, no randomness, no I/O, no cross-scenario read.
- **FR-2 — Findings and the suggested recommendation belong to exactly one Scenario.**
  They never exist independently of it; a cited `FinancingCase` is a reference, not a
  second owner.
- **FR-3 — Findings are deterministic, rebuildable, disposable, and idempotent.** Delete
  them and they regenerate identically from the settled outputs + ruleset; a no-op
  rebuild performs zero writes.
- **FR-4 — Rules are fixed and versioned.** The ruleset lives in code; changing, adding,
  or removing a rule (or a threshold) REQUIRES a `RULESET_VERSION` increment — nothing
  else. No user-authored formulas or scripting.
- **FR-5 — The engine reports and recommends; humans decide.** The suggested
  recommendation is advisory only and never modifies an underwriting result (UW-4); the
  *decided* recommendation + `UNDERWRITING_APPROVAL` remain deferred (U-B / 3d).
- **FR-6 — A ruleset change never alters a deterministic result.** It must not change any
  metric, cash flow, valuation, financing result, IRR, equity waterfall, or sensitivity
  output — guaranteed structurally by the fingerprint separation above.

Scope excludes (deferred): market-signal / external-data risks (occupancy, 1.2 signals),
the decided recommendation + approval workflow, offer-memo/LOI export, configurable rules,
and any ML/narrative. 3b-vi evaluates ONLY the scenario's own frozen underwriting outputs.

## 5. Commit 3a — Underwriting Model Formalization (headed by this lock)

3a establishes the ownership model without deepening the math:

- Models `Underwriting`, `UnderwritingScenario`, `UnderwritingAssumption`,
  `ScenarioResult` (additive migration `20260715140000_add_underwriting_model`).
- Pure modules `lib/underwriting/model-version.ts` (lineage + `computeScenarioVersion`),
  `assumptions.ts` (typed keys + total mapping to `AnalysisInputs`), `scenario-result.ts`
  (pure derivation). `lib/analysis.ts` is **unchanged**.
- Service `lib/underwriting.ts` owns the Decimal↔number boundary (U-D/U-E), the
  lifecycle (U-B/U-L), the one-way ScenarioSeed snapshot, and the content-idempotent
  rebuild (UW-3/UW-9).
- Analyzer repointed behavior-preservingly; `UNDERWRITING` RBAC added (U-J);
  `DealAnalysis` retained deprecated with an idempotent backfill.

Determinism is proven by executable tests: reconstruction (rebuild byte-for-byte;
stored `scenarioVersion` == recomputed), zero-write idempotency (Postgres `xmin`),
one-way snapshot (a Property change never mutates a Scenario), and reconstruction
reading only frozen assumptions (never current Property state).

## 6. Commit 3b — deepening the math (in progress)

3b deepens the financial engine only (never ownership/lifecycle/governance/V1.2), as
a sequence of deterministic sub-slices, each a pure sibling to `lib/analysis.ts`:
**3b-i debt sizing (shipped — DS-1…DS-4)** → **3b-ii income/expense schedules (shipped —
IS-1/IS-2/IS-3)** → **3b-iii cash flow (shipped — CF-1…CF-5)** → **3b-iv exit + waterfall
(shipped — EX-1…EX-6)** → **3b-v sensitivity (shipped — SE-1…SE-7)** → **3b-vi
findings/risks + suggested recommendation (in progress — FR-1…FR-6; first `RULESET_VERSION`
behavior, ruleset 1→2, with the R-A fingerprint separation)**. Still separately
gated and out of scope until reached: the decided Recommendation + `UNDERWRITING_APPROVAL`
(3d) and offer-memo/LOI export (Documents). Removing the deprecated `DealAnalysis`
table is deferred to a post-acceptance release ([D15](../roadmap/TECHNICAL_DEBT.md)).
