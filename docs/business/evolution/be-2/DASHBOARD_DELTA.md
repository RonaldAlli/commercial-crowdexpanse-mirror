# BE-2 Step 1 — Dashboard Delta

| Domain area | Before | After | Basis (evidence, not estimate) |
|---|---|---|---|
| **Deal** | 10% | **~25%** | A first-class `deals` table + deterministic, org-scoped, idempotent, control-fact-anchored `ensureDeal`, proven by 23 E2E assertions. **Not** re-parented, surfaced, reporting-authoritative, or live. |
| Domain | 75% | ~77% | Deal now exists as an object (Invariant 4 partially represented); Transaction/Market still absent. |

## Why the jump is modest (honest measurement, not celebration)
Adding a table is not alignment. Deal alignment stays well below 50% because Step 1 deliberately does
**none** of the following:
- re-parent escrow/financing/assignment/closing (those belong to Transaction — BE-5);
- provide a Deal Workspace or any UI;
- make Deal authoritative in any report;
- carry lifecycle state beyond existence;
- **produce a single Deal in production** — the control fact is not emitted live (pipeline dormant, O-2).

The +15 points reflect exactly one thing: the business object now **exists** in the model's shape, with
a correct, safe, event-anchored creation path. It becomes load-bearing only as later steps (emission,
Deal Workspace, reporting) land — and it reaches high alignment only alongside BE-5 (Transaction).
