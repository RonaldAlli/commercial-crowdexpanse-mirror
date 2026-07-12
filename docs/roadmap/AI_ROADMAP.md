# Volumes 5 & 6 — Intelligence & AI Roadmap

> Two layers, in strict order: first **deterministic intelligence** (Volume 5, data enrichment — largely v1.2), then **AI** (Volume 6, v2.0) *on top of* that data and the workflows it feeds.
> **AI only after workflows exist.** No AI capability ships over a process we haven't proven by hand.

---

## Volume 5 — Intelligence Roadmap

A ladder: each rung enriches the entities below and feeds the ones above. This is **deterministic** (imports, joins, computed rollups) — not AI. Delivered mainly in [v1.2](./VERSION_1_2.md), consumed by underwriting ([v1.3](./VERSION_1_3.md)).

```
Market Intelligence      ← submarket comps, rent/vacancy/cap benchmarks
        ↓
Property Intelligence    ← asset facts, unit mix, tax/assessment, prior sales
        ↓
Owner Intelligence       ← ownership entity, hold period, distress/motivation
        ↓
Financial Intelligence   ← underwriting metrics from the above (Analyzer, v1.3)
        ↓
Opportunity Intelligence ← per-deal risk/attractiveness from financial + market
        ↓
Portfolio Intelligence   ← org rollups: pipeline value, exposure, source ROI
```

| Layer | Feeds | Source strategy | Status |
|---|---|---|---|
| Market | Property, Underwriting | Licensed feed / manual / public (legal-gated) | 🔴 1.2 |
| Property | Underwriting | Import + manual | 🔴 1.2 |
| Owner | Seller sourcing, motivation | Entity data (legal-gated) | 🔴 1.2 |
| Financial | Opportunity decisions | Computed (`lib/analysis.ts`, v1.3) | 🟡 foundation |
| Opportunity | Prioritization | Computed from financial + market | 🔴 1.3 |
| Portfolio | Exec/ops decisions | Computed rollups | 🔴 1.2 |

**Principles:** provenance on every enriched field; deterministic over inferred; org-scoped; additive schema; graceful degradation when a layer is absent.

---

## Volume 6 — AI Roadmap

AI augments — never replaces — the team's judgment, and only over workflows that already exist ([v2.0](./VERSION_2_0.md)).

### Binding AI boundaries
- **Human-in-the-loop for writes:** AI proposes; a human confirms before any DB write.
- **Deterministic fallback:** every AI feature degrades to the manual workflow it augments.
- **Org-scoped:** AI sees only one org's data; no cross-tenant context.
- **Auditable:** AI suggestions/actions are logged like any activity.
- **Centralized provider/model:** one client module; default to the latest, most capable Claude models.

### Capability spec template
Every AI capability MUST document all seven before build:

| Field | Meaning |
|---|---|
| **Purpose** | The decision/task it augments |
| **Inputs** | Exact data (org-scoped) it reads |
| **Outputs** | What it proposes (never auto-commits writes) |
| **Business Rules** | Constraints/guardrails it must respect |
| **Failure Modes** | How it can be wrong; detection |
| **Human Override** | How a human edits/rejects/corrects it |
| **Testing** | Tests for correctness AND failure modes |

### Candidate capabilities (v2.0, each needs a full spec)
1. **Document extraction** — T12/rent-roll → underwriting inputs. *Fallback:* manual entry.
2. **Underwriting narrative** — draft analyst summary from `DealAnalysis`. *Fallback:* analyst writes it.
3. **Buyer-match rationale** — explain why a buyer scored. *Fallback:* deterministic score only.
4. **Conversation intelligence** — summarize seller/buyer calls, extract terms/motivation. *Fallback:* manual notes.
5. **Pipeline nudges** — flag stalled/at-risk deals. *Fallback:* time-in-stage report.
6. **Semantic/NL search & list queries.** *Fallback:* current deterministic search + filters.

### What AI will NOT do (v2.0)
- Write to the database without human confirmation.
- Move pipeline stages or send external communications autonomously.
- Operate across organization boundaries.
- Replace the underwriting math or the matching scorer (it explains/assists them).
