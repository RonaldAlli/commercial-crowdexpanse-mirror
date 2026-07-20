# CrowdExpanse Commercial — Product Baseline

> **What the application does today** — the accepted, production capabilities. Companion to the
> [Operations Baseline](./OPERATIONS_BASELINE.md) (how prod behaves) and [Engineering
> Baseline](./ENGINEERING_BASELINE.md) (how changes ship). Volatile values live in [Current Platform
> Status](../CURRENT_PLATFORM_STATUS.md). **As of 2026-07-20.**

## Domains (accepted + in production)
| Capability | What it does | State |
|---|---|---|
| **Property identity** (V1.2) | Deterministic `PropertyIdentity` index + immutable crosswalk; identity is its own architecture (≠ Owner). | Live |
| **Commercial Underwriting** (V1.3) | Deterministic engine (`lib/analysis.ts`): scenarios + lineage/fingerprints, findings, recommendations, **immutable UnderwritingDecision** (terminal human approval, never a calc input), scenario comparison, **Offer-Memo** generation. | **Frozen** `v1.3.0` (`d341c0a`) |
| **Closing Center** (V1.4) | Checklist-gated `UNDER_CONTRACT → PAID`; composed PAID gate (`isClosingReady ∧ canMoveStage`); Escrow · Financing · Assignment (immutable terminal snapshots); Transaction Dashboard · Timeline · list badges (pure read-only projections, TX-6). | **Frozen** `v1.4.0` (`ece38aa`) |
| **CRM** (off-roadmap, accepted) | Owner Contacts + Touches, Seller/Contact outreach (free-form status), Opportunity pre-contract Diligence, DealAutomator Lead Import (**CSV/TSV/TXT/JSON only**, ADR-0006), ATM Wholesale calculator (**advisory / non-authoritative**, no persistence, no `analysis.ts` coupling). Additive, org-scoped, isolated from frozen domains. | Live |
| **Opportunity Pipeline — Stage Policy** (Slice 1) | Stages are **operational projections over authoritative business facts** (semantic contract): a pure rule engine + reusable `evaluateStageTransition`/`applyStageTransition` seam; diligence-named stages validate their diligence truth, with a controlled **attestation** (reason → `stage_attested` ActivityLog) for imported/mid-lifecycle deals; **bounded board** (per-stage counts + ≤25 cards/column + View-all). | **Frozen** `opportunity-pipeline-slice1` (`a2f9fd4`) |
| **Automation** (V2.0.1) | Job/execution spine + policy + proof-observer; migration 27 in prod. **Executor NEVER started** — paused at dark-start (D19). Owns no authoritative state; read-only proof only. | **Paused** (inert) |

## Standing product invariants
- Underwriting is **deterministic**; AI/automation is never a calculation input; underwriting history is immutable.
- Closing terminal states (PAID, executed assignment, resolved escrow, funded financing) are protected; the PAID gate is composed, never replaced.
- Pipeline **stages are projections**, not sources of truth — they visualize domain objects, never own them.
- CRM/ATM/Import may **supply** data but cannot write Underwriting/Closing truth or bypass their gates.
- Every tenant-owned record is **organization-scoped**; imports/CRM fail closed cross-org.

## Not yet in product (deferred / gated)
Automation execution (D19) · later Opportunity Pipeline slices (UNDERWRITING → BUYER_MATCHED →
OFFER_READY → LOI_SENT → PAID-policy) · Excel import · AI · email/SMS. Each is its own reviewed initiative.
