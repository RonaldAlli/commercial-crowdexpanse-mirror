# Human Review Principles

> **Purpose.** The governance philosophy for every **review UI** in the system — the surfaces where a person acts on what a deterministic engine surfaced. It is entity-general on purpose: it binds Owner Candidate Review, Property Candidate Review, and any future review workflow (Organization identity, Buyer identity, and beyond) to the same rules, so each new review experience **explains and governs** its engine rather than quietly redefining it.
>
> **Not a lock, not a plan** — a small, stable reference. Where a specific workflow needs mechanics, they live in that domain's lock/docs (e.g. [Property Identity Lock](./PROPERTY_IDENTITY_LOCK.md), [Property Identity Decision Matrix](./PROPERTY_IDENTITY_DECISION_MATRIX.md), Volume 12 §7). This page is the *why* those mechanics all share.

The engine's job is to be **correct**. A review UI's job is to let a human **interact with that engine safely** — preserving deterministic reasoning, auditability, explainability, and reversibility without exposing unnecessary complexity. Those are different problems; these five principles keep the second from undermining the first.

---

## Principle 1 — Humans review; the engine classifies

The deterministic classifier owns **classification** (for Property, the finite [Decision Matrix](./PROPERTY_IDENTITY_DECISION_MATRIX.md)). A human never re-runs or hand-edits a classification; they act on the **candidates** and **proposals** the engine surfaced. Review chooses among engine-produced options — it does not invent a new outcome outside the engine's model.

## Principle 2 — Humans override the operational effect; they never rewrite history

A person may change what a decision *does* — confirm a match, dismiss a proposal, reverse a resolution, reopen a dismissal. Every such change is a **new, appended event**; the original decision and its basis remain historically true. The record reads "this happened, and its effect was later changed" — never "this never happened." (Property: RES-7 — a reversal appends a `REVERSAL` event and revokes attachments; it never mutates the original `RESOLVE`.) **Every override is reversible or explicitly re-decidable**, and the reversal is itself auditable.

## Principle 3 — Human decisions append; they never mutate evidence

A review decision is **decision-support**: it writes an append-only decision record and **never** touches the evidence ledger — no Observation or Signal is written, edited, or deleted, and no canonical entity is created, deleted, or silently repointed. (Property: RES-5 — resolution/decision only appends and deterministically rebuilds.) Confirming a duplicate **records a judgement**; structural consolidation (merge) is a separate, explicit, reversible, ADMIN-governed action — never a side effect of review.

## Principle 4 — The UI explains: what, what, why, and what else

A review surface must show, for each decision:
- **what the engine observed** — the evidence, with provenance (projected value → winning signal → signal history);
- **what it concluded** — the tier / outcome;
- **why** — the deterministic `basis` (explanatory metadata, never a score), traceable to the Decision Matrix;
- **what alternatives existed** — the candidate set and the competing evidence.

A decision a reviewer cannot understand from the surface is a UI defect, not a reviewer error.

## Principle 5 — Every human decision is attributable and auditable

Each decision records **who, when, and (where it matters) why**; privileged actions (reopen, reverse, merge) are distinct, higher-authority steps; access is governed by the entity's identity authorization tier (`OWNER_IDENTITY` / `PROPERTY_IDENTITY` — governance, not operational reporting) and **denials are audited**. Suppression is never permanent by accident: a dismissed candidate re-surfaces on a **material identity change** (a deterministic fingerprint drift) or an explicit reopen.

---

## What this binds

| Review workflow | Realization |
|---|---|
| **Owner Candidate Review** | `lib/owner-match.ts` — confirm/dismiss (decision only), ADMIN reopen, dismissed re-surfaces on material `signalFingerprint` change; merge is separate + reversible + provenance-audited. |
| **Property Candidate Review** | `lib/property-match.ts` — same shape; resurfacing via the 2c-i `identityVersion`; resolution reversal via `PropertyResolution` (RES-7). Exposed to users at Commit 2c-iii. |
| **Future (Organization / Buyer identity, …)** | Inherit these five principles by default; a new review UI adopts them before adding domain mechanics. |

**Litmus test for any review UI:** *Does it explain the engine, preserve the ledger, append rather than mutate, and remain fully auditable?* If yes, it governs the engine. If it changes what the engine would deterministically conclude, or edits evidence to force an outcome, it has crossed a line these principles forbid.
