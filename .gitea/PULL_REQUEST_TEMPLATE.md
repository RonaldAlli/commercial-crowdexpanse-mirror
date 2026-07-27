<!-- CrowdExpanse — every change is judged as Business Alignment, not "a feature." -->

## Summary

<!-- What changes, and why. -->

## Business Alignment check

> **When implementation and the Business Architecture disagree, implementation is assumed incorrect
> until proven otherwise.** The burden of proof is on the implementation — not because engineering is
> wrong, but because engineering represents something else, and the Business Architecture
> (`docs/business/`, v1.0) is the authoritative description of the business.

- [ ] Which business **object / lifecycle / capability / workflow** does this represent?
- [ ] Uses only the **canonical language** (Business Language Specification, §2) — no deprecated terms (§3)?
- [ ] Preserves **immutable events** and derives state from them (no hand-set lifecycle state)?
- [ ] **Additive before replacement** (Preservation) — nothing removed until the new representation proves itself?
- [ ] Which **Business Evolution Initiative** (BE-1…BE-5) does it advance, if any?
- [ ] Which row on the **Business Alignment Dashboard** does it improve?

## Verification

<!-- Gate (typecheck + unit + build) and prod-verify evidence. -->
