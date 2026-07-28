# CrowdExpanse — Business Alignment Dashboard
## The scoreboard for the Business Alignment phase

> **Status:** LIVING document — baseline snapshot 2026-07-27. This is **not a backlog.** It measures
> how faithfully the **platform** represents the frozen **Business Architecture** (v1.0). Engineering
> does not chase features here; it **improves alignment.** Every domain area is scored: does the
> platform faithfully represent the architecture for it?

## The phase this dashboard governs

The next phase is **Business Alignment**, not "implementation." Alignment sometimes means schema
changes, sometimes UI, reports, workflows, training, documentation, or APIs — and sometimes code.
Sometimes it means no code at all. The unit of progress is **a more faithful representation of the
architecture**, tracked below.

**Legend:** Architecture ✅ = defined at v1.0. Platform ✅ faithful · 🟡 partial · ❌ missing.
Alignment % is a judgment of how completely the platform represents the architecture for that area.

## Scoreboard (baseline)

| Domain area | Architecture | Platform | Alignment | Driven by |
|---|---|---|---|---|
| Constitution | ✅ | — | 100% | — |
| Operating Model | ✅ | 🟡 | 90% | — |
| Domain | ✅ | 🟡 | 75% | BE-1, BE-2, BE-5 |
| Capabilities | ✅ | 🟡 | 80% | — |
| Language | ✅ | 🟡 | 65% | BE-3 |
| Events | ✅ | 🟡 | 70% | BE-4 |
| Lifecycles | ✅ | ❌ | 40% | BE-4 |
| Workflows | ✅ | 🟡 | 60% | BE-4 |
| **Market** | ✅ | ❌ | 0% | **BE-1** |
| **Deal** | ✅ | 🟡 | ~25% | **BE-2** (Step 1: additive aggregate, inert — see `evolution/be-2/DASHBOARD_DELTA.md`) |
| **Transaction** | ✅ | 🟡 | 25% | **BE-5** |

*(Percentages are directional judgments to make progress visible, not precise metrics. They move as
Business Evolution Initiatives land.)*

## How to read it

- The lowest-alignment rows — **Market (0%)**, **Deal (10%)**, **Transaction (25%)**, **Lifecycles
  (40%)** — are the highest-leverage work, and each maps to a Business Evolution Initiative
  (`ALIGNMENT_INITIATIVES.md`).
- Raising **Deal (BE-2)** lifts Domain, Transaction, Language, and Workflows together — which is why
  it is recommended first among the object initiatives.
- A row reaches 100% only when the platform is a faithful representation of the architecture for that
  area — verified against the Language Specification, the Event Vocabulary, and the Lifecycle Model,
  not by "the feature exists."

## The question that drives every entry

> **Which business object, lifecycle, capability, or workflow still lacks a faithful representation?**

That question — not "what screen should we build?" — is what this dashboard exists to keep in front
of everyone.
