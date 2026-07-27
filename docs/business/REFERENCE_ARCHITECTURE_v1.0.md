# CrowdExpanse Business Architecture — Version 1.0 (Frozen)

> **Frozen 2026-07-27 by founder ratification.** This is the RFC/constitution-equivalent baseline
> of the CrowdExpanse Business Architecture. From this point, the documents below are **not edited
> casually.** Every change is a **governed change** under `CHANGE_GOVERNANCE.md`, and material
> changes advance the version (v1.1, v2.0). "Frozen" does not mean *done forever* — it means
> *stable, versioned, and protected.*

## What is frozen at v1.0

| # | Document | File | Role |
|---|---|---|---|
| — | Manifesto | `MANIFESTO.md` | why the company exists (sits above the Constitution) |
| 0 | Constitution | `0_CONSTITUTION.md` | purpose, principles, authority, the governing test |
| 1 | Operating Model | `1_OPERATING_MODEL.md` | how the company creates value |
| 2 | Domain Model | `2_DOMAIN_MODEL.md` | what exists in the business |
| 2.5 | Capability Map | `2_5_CAPABILITY_MAP.md` | what the company must be able to do |
| 3 | Language Specification | `3_LANGUAGE_SPECIFICATION.md` | what everything is called (ratified) |
| 4 | Event Vocabulary | `4_EVENT_VOCABULARY.md` | what business truths are permanently recorded |
| 5 | Lifecycle Model | `5_LIFECYCLE_MODEL.md` | how each object evolves |
| 6 | Workflow Model | `6_WORKFLOW_MODEL.md` | how people perform work |
| — | Architecture Map | `ARCHITECTURE_MAP.md` | how all the layers fit together |
| — | Change Governance | `CHANGE_GOVERNANCE.md` | how the architecture is changed |

## Supporting artifacts (living — not frozen)

These evolve *with* the platform and are expected to change as alignment progresses:

- `LANGUAGE_CONFLICT_REPORT.md` — the code-vs-language reconciliation that fed the ratified §2/§3.
- `ALIGNMENT_INITIATIVES.md` — the **Business Evolution Initiatives** (BE-1 … BE-5).
- `PLATFORM_MAPPING.md` — module → object/lifecycle/workflow status.
- `BUSINESS_ALIGNMENT_DASHBOARD.md` — the living scoreboard of architecture-vs-platform alignment.

## What comes next is not "implementation"

The next phase is **Business Alignment**, not development. Every change — whether it turns out to be
schema, UI, reports, workflows, training, documentation, APIs, or code — is judged by one question:
**does it make the platform a more faithful representation of this frozen architecture?** Progress is
measured on the Business Alignment Dashboard, not on a feature backlog.

## Tag history (one-time governed exception)

The annotated tag `business-architecture-v1.0` is **re-pointed to track the branch tip during a
single, bounded pre-merge finalization window** — the interval before this baseline's first merge, in
which the founding material was completed (BORA framing · the inviolable layer ordering · the
Preservation and Continuity principles · the closing statement on preserving understanding). This is
permitted **only** because the baseline has **not yet merged to `main` and has not been operationally
consumed.** **The window closes at merge.** From the moment v1.0 merges, its tag is **immutable**, and
every subsequent change advances the version (v1.1, v2.0). **Re-pointing a published tag is not normal
practice** (see `CHANGE_GOVERNANCE.md`); it is confined to this one pre-merge window and recorded here
so it is never mistaken for a precedent.
