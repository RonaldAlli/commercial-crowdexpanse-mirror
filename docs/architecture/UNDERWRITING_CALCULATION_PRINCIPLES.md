# Underwriting Calculation Principles

> **Purpose.** The governance philosophy for every **financial calculation** in the
> system — the pure functions that turn a Scenario's assumptions into metrics,
> findings, risks, and a suggested recommendation. It is deliberately model-general:
> it binds today's core metrics (`lib/analysis.ts`) and every future formula (NOI
> line-items, debt sizing, multi-year cash flow, sensitivity, risk scoring) to the
> same rules, so the calculation engine can be **deepened** in later slices without
> eroding determinism, reproducibility, or ownership.
>
> **Not a lock, not a plan** — a small, stable reference. The load-bearing structure
> lives in the [Underwriting Architecture Lock](./UNDERWRITING_ARCHITECTURE_LOCK.md)
> (decisions U-A…U-L, invariants UW-1…UW-9); this page is the *why* every formula
> shares. It is to financial modeling what the [Human Review Principles](./HUMAN_REVIEW_PRINCIPLES.md)
> are to review UIs.

The engine's job is to be **correct and reproducible**. As the math grows more
complex, the risk is not a wrong formula — that a test catches — but a formula that
quietly depends on something it shouldn't: the clock, another scenario, an approval
state, a display-rounded value. These principles keep every metric a pure function
of one Scenario's frozen inputs, forever.

---

## The governing constraint — a metric is a pure function of one Scenario

Every deterministic output is a function of **exactly one Scenario's frozen
assumptions + that Scenario's model lineage — and nothing else.** Not the clock, not
randomness, not the database, not another Scenario, not a recommendation, not a
display value. If a calculation needs a fact, that fact must be an explicit
assumption on the Scenario.

```
Scenario (frozen assumptions + lineage) → pure kernel → metrics / findings / risks   (always)
Anything else → a calculation input                                                  (never)
```

The eleven principles below are how this constraint is upheld in practice; if any is
ever in tension with convenience, this constraint wins.

---

## Principle 1 — Calculations are pure

A calculation is a pure function of its inputs: no wall-clock, no randomness, no
Prisma, no I/O, no ambient state, no mutation. It lives in a pure module
(`lib/analysis.ts` and pure siblings), importable from both server actions and
server components, and unit-tested in isolation with worked examples. Purity is what
makes reproducibility (Principle 3) *possible* (UW-2/UW-3).

## Principle 2 — Assumptions are explicit

Every input is a named, typed, provenanced **assumption** on the Scenario — never a
hidden constant, an implicit default, or a live read of another entity. An imported
default is a **SEEDED** assumption (a one-way ScenarioSeed snapshot with `sourceField`
+ `sourceAsOf`); an analyst input is **MANUAL**. The distinction between imported and
authored is always visible, and no calculation reaches outside the assumption set for
a value (U-C, U-D, UW-5).

## Principle 3 — Every metric is reproducible

Every derived output is **rebuildable** from frozen assumptions + model lineage + the
kernel, byte-for-byte, in any process, at any later time. The derived surface
(`ScenarioResult`) is **disposable** — delete it and it regenerates identically; the
**Scenario is never disposable** (UW-9). Reconstruction reads *only* frozen
assumptions — never current Property state or any live source.

## Principle 4 — Calculation precision is separate from presentation rounding

The kernel computes and stores at **full model precision** — money as integer USD,
rates and ratios as their computed values, `Decimal` in persistence converted to
`number` only at the kernel boundary (D-6). **Rounding and formatting for display are
a presentation concern** and never feed back into a stored or derived value. A number
shown as `$53,960` may be `53959.55` underneath; the UI rounds the *view*, never the
*value*. (This is why `annualDebtServiceUsd` is a `Float`, not an `Int`: truncating a
2-decimal amortized payment at the storage layer would corrupt reconstruction.) The
UI never performs an authoritative calculation (UW-6).

## Principle 5 — No metric reads another Scenario

Every deterministic output belongs to **exactly one Scenario**; a calculation never
crosses a Scenario boundary. Metrics, findings, risks, and the suggested
recommendation never exist independently of their Scenario, and never borrow a value
from a sibling, prior, or superseded Scenario. Comparing scenarios is a *read* over
independently-computed results — never a computation that entangles them.

## Principle 6 — No metric depends on workflow or approval state

A calculation is independent of the decision it informs. It never reads a Scenario's
status (`DRAFT`/`LOCKED`/`SUPERSEDED`), a lock timestamp, a lifecycle flag, or any
approval/workflow state. Locking freezes a Scenario's **meaning** for governance
(UW-8) — it does not *change* what the metrics are. The same assumptions yield the
same metrics whether the Scenario is a draft or locked.

## Principle 7 — Recommendations never become calculation inputs

The suggested recommendation (and, later, the decided recommendation /
`UNDERWRITING_APPROVAL`) is strictly **downstream** of calculation — a *reading* of
the metrics, never an *input* to them (UW-7, UW-4). No metric may depend on a
recommendation, and the engine never makes the acquisition/disposition decision. The
dependency arrow points one way: assumptions → metrics → findings/risks →
suggested recommendation → (human) decided recommendation.

## Principle 8 — Every projection extends the previous one; it never replaces it

The financial model grows as a **stack of layers, each consuming the one beneath it**
and adding to it — never rewriting it. Today the stack is `Operating NOI → Debt
service → Cash flow before tax`; later layers (`→ Terminal value → Equity waterfall →
IRR → Equity multiple`) attach on top. A new layer reads the settled output below as a
frozen input and produces a *new* output; it never reaches back and restates an
earlier result. This is why the operating NOI trajectory is computed once and reused
identically by every FinancingCase (CF-5), and why capital economics sit *on top of*
operating economics rather than mixed into them (CF-1/CF-2). The dependency arrow is
one-way through the whole stack, exactly as it is for assumptions → metrics →
recommendation (Principle 7). Deepening the math is always **adding a layer**, never
editing a lower one.

## Principle 9 — Projections are disposable, rebuildable, and deterministic — never authoritative

Every projected surface — `CashFlowYear` today, and every future terminal/exit/
waterfall/return projection — is a **cache of a pure function**, not a source of
truth. It is disposable (delete it and it regenerates identically), rebuildable purely
from frozen assumptions + the layers beneath it + lineage, and deterministic (no clock,
no randomness, no cross-scenario read). Nothing downstream ever becomes authoritative
over its inputs: a computed IRR never edits the cash flow it came from; a terminal
value never edits the operating NOI. The Scenario's frozen assumptions (and each
case's capital) remain the *only* authoritative facts — every projection above them is
regenerable and therefore safe to throw away (extends Principle 3 to the whole stack).

## Principle 10 — Sensitivity never changes a deterministic result

A sensitivity analysis is a **consumer** of the engine, not another calculator. It
creates *alternate* projections by re-running the pure derivation over perturbed
inputs, compares their outputs, and **never mutates** the base Scenario, its
FinancingCases, its assumptions, or any persisted deterministic result. It reads the
model; it never writes back into it. The dependency arrow points one way — base →
sensitivity, never sensitivity → base — exactly as it does for metrics → recommendation
(Principle 7). A sensitivity cell is a *what-if reading*, never an authoritative fact.

## Principle 11 — Every sensitivity analysis has one immutable baseline

There is always exactly **one baseline** — the frozen Scenario and its cases — and the
variants are derived *from* it, never the reverse. A variant never rewrites the
baseline; every comparison is variant-vs-baseline. Because each variant is a pure
function of the baseline's frozen assumptions + the specific variation it applies, the
whole analysis is reproducible and disposable: delete it and it regenerates identically
from the baseline (an application of Principles 3 and 9 to the sensitivity layer).

---

## Model lineage — how calculations are allowed to change

Formulas are not immutable, but they change **explicitly**. A change to calculation
behavior is a **`CALCULATION_LIBRARY_VERSION`** bump; a change to the model's shape or
which assumptions exist is an **`UNDERWRITING_MODEL_VERSION`** bump; a change to the
findings/risk ruleset is a **`RULESET_VERSION`** bump (U-K). Lineage is frozen onto
every Scenario and folded into `scenarioVersion`, so a metric is always reproducible
*under the lineage that produced it*, and an assumption change is always
distinguishable from a calculation-model change. New formulas are added as **pure
sibling modules** to `lib/analysis.ts`, never by weakening the kernel.

---

## What this binds

| Calculation surface | Realization |
|---|---|
| **Core metrics (today)** | `lib/analysis.ts` — pure `computeAnalysis`; NOI, cap rate, DSCR, debt yield, price/unit, spread. Unchanged by Commit 3a. |
| **Derivation + persistence** | `lib/underwriting/scenario-result.ts` (pure derive) + `lib/underwriting.ts` (`rebuildScenarioResult`, content-idempotent, reads only frozen assumptions). |
| **Future math (3b+)** | Line-item NOI, debt sizing, multi-year cash flow, sensitivity, risk scoring — each a pure sibling module, versioned via lineage, adopting these principles **before** adding complexity. |

**Litmus test for any calculation:** *Is it a pure function of one Scenario's frozen
assumptions and lineage — reproducible, precision-preserving, scenario-local,
approval-independent, and never fed by a recommendation?* If yes, it belongs in the
engine. If it reads the clock, another scenario, a display value, or a decision, it
has crossed a line these principles forbid.
