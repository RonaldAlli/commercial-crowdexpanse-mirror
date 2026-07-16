# Version 1.4 — Progress Review (after Slices 1 & 2)

> A checkpoint review requested before starting Financing (Slice 3). Covers what now
> exists, how the Closing Center is evolving, whether any architecture should be revisited,
> and emerging cross-cutting concerns. Design authority remains
> [`CLOSING_CENTER_ARCHITECTURE_LOCK.md`](../architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md).

**Status:** Slices 1 & 2 LIVE in production (prod **24 migrations**, serving `hJJCViPhweeyHioi_UMkP`, `main` @ `4ca5865`). Version 1.4 is **~30% complete** and explicitly **not** finished.

## 1. Capabilities now in production

- **Closing Foundation + Due Diligence (Slice 1).** A first-class `ClosingChecklist` (1:1 Opportunity), instantiated by a one-way snapshot of a versioned `ClosingChecklistTemplate` (CC-G/CC-10); typed items with owner/due-date/evidence; the pure `isClosingReady` **PAID gate** composed with `canMoveStage` (never replacing it); a blocked-PAID move explains which required items remain; `CLOSING` RBAC with an ADMIN-only reasoned waiver.
- **Escrow (Slice 2).** A first-class `EscrowRecord` (1:1 Opportunity) with the `NOT_OPENED→OPENED→DEPOSITED→{RELEASED|REFUNDED|FORFEITED}` lifecycle, whole-USD earnest money, free-text holder, proof-of-deposit Document link; terminal transitions write an **immutable append-only `EscrowEvent`** snapshot and freeze the record (EC-I/EC-11); ADMIN-only reasoned resolution; the PAID gate is **unchanged** — escrow gates PAID only via a required `ESCROW` checklist item (EC-H); an optional/explicit checklist-sync affordance (EC-J).

Both are **human operational workflow strictly outside the deterministic underwriting engine** (CC-1/EC-1/EC-9/EC-10); `lib/analysis.ts` and every V1.3 surface remain untouched. The frozen `v1.3.0` baseline is unaffected.

## 2. How the Closing Center is evolving

The domain is settling into a consistent, deliberately-layered shape per capability:

```
pure lib/<domain>.ts        — guards + display (no Prisma/clock; unit-tested, CRITICAL)
lib/<domain>-service.ts     — DB orchestration + ActivityLog audit
lib/permissions.ts          — CLOSING write + a stricter ADMIN-only sub-check
app/.../<domain>-actions.ts — auth-enforcing server actions
components/<domain>-card.tsx — a card on the Opportunity detail page
scripts/e2e-<domain>.mjs    — behavior + org-isolation on the guarded _test DB
```

Consistent cross-cutting choices: org-scoped + cascade-owned off `Opportunity`; scalar cross-domain ids (no FK); every state change audited via `ActivityLog`; Documents reused for artifacts; the PAID gate stays checklist-driven and configurable, never hardcoded per capability. This coherence is the point — each slice is legible because it repeats the established shape.

## 3. Should any architecture be revisited before Financing?

**No.** The Closing Center lock and its invariants have absorbed two very different capabilities (a homogeneous gated checklist; a singleton financial record with an immutable ledger) without strain. The PAID-gate composition, the `CLOSING` RBAC + ADMIN-only sub-check pattern, the ActivityLog audit convention, Documents reuse, and the "outside the engine" boundary all generalize cleanly. Financing extends the lock as a **new slice with its own ratified decision package** (as Escrow did) — it does not require reopening any existing decision.

## 4. Emerging cross-cutting concerns

1. **A common "operational workflow record" abstraction? — Not yet (rule of three).** Checklist items and escrow share a shape (status + actor/timestamp stamps + pure guard + ActivityLog audit + Documents linkage + org scope). But the *reuse that matters is already achieved through shared platform services* (ActivityLog, Documents, permissions), not a shared domain base — and the two records legitimately differ (a gated homogeneous collection vs. a singleton with a terminal immutable ledger). Extracting a base class from **two** instances risks the wrong abstraction and couples unlike lifecycles. **Recommendation:** treat it as a watch-item; if **Financing (Slice 3) repeats the same shape a third time**, evaluate codifying a documented *convention/helper* (not necessarily a base model) at that point.

2. **Financing ≠ underwriting `FinancingCase` — the key boundary to get right.** V1.3 already has a `FinancingCase` inside the *deterministic underwriting engine* (capital structures for scenario math). Slice 3 "Financing" is **operational tracking** of the buyer's/assignee's actual financing status — a different concept. These must stay strictly separate: operational Financing must never read into or feed the engine (the EC-9/EC-10 discipline applies), and at most holds a **read-only reference** to underwriting output. This will be the load-bearing decision in Financing's package.

3. **Opportunity detail page growth.** The page now stacks stage/terms + closing checklist + escrow + buyer matches + links + activity + notes; Financing and Assignments cards are coming. This is **UI-only** (no architecture impact) but worth watching — a future section/tab decomposition may improve legibility.

4. **`CLOSING` RBAC as a multi-sub-domain resource.** It now governs checklist + escrow and will govern financing. Still coherent (all "closing workflow"), with per-capability ADMIN-only sub-checks (`canWaiveClosingItem`, `canResolveEscrow`) for the high-risk actions. Watch whether any sub-domain ever needs a distinct read/write tier; none does today.

5. **Test-infrastructure reliability.** The transient `tsx`/Node-20 E2E-runner SIGSEGV is now tracked as **[D16](./TECHNICAL_DEBT.md)** (not a feature defect; runner hardening + Node 22 upgrade planned).

## 5. Recommendation

No architecture changes are required before Financing. Proceed with the **same architecture-first workflow**: read the Financing roadmap scope, inspect the affected models/conventions, determine that it is a new mechanism, and **present a Financing decision package for ratification before writing code** — with the operational-Financing-vs-underwriting-`FinancingCase` boundary (concern #2) as the central question. Do not begin implementation until ratified.
