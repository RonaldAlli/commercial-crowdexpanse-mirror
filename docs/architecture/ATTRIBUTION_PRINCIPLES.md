# Attribution Principles (platform-wide)

> Cross-cutting business-measurement guidance for **every** object derived from an acquired lead — not scoped to any
> one subsystem. Established 2026-07-23 at the start of the Seller Source Optimization initiative. Sits alongside
> `AUTHORITY_PRINCIPLES.md`; both are platform principles, not application details.

---

## Attribution Rule 1 — Acquisition source must survive the chain

> **Every business object derived from a lead must retain enough information to reconstruct its acquisition source.**

### Why

Source economics — *which channel produced this opportunity / this deal / this dollar of revenue* — are executive
questions, not engineering ones. They are answerable only if the acquisition source is (a) **captured** at the lead
and (b) **retained** on every object derived from it, all the way to revenue. If attribution is missing at any link,
every optimization decision downstream becomes guesswork.

### The chain that must stay attributable

```
Source / channel   (captured on the LEAD at acquisition)
        ↓
Lead (Seller)      retains source
        ↓
Opportunity        RETAINS source — stamped at creation, not merely joined
        ↓
Buyer match / Agreement / Assignment
        ↓
Revenue            attributable back to the originating source
```

### How to apply

1. **Capture at the source of entry** — the lead records a structured acquisition channel when it is imported or
   created (not a free-text afterthought; a governed taxonomy, so channels are comparable).
2. **Retain, don't merely reference.** A derived object must carry its own retained copy of the source, because a
   live foreign-key join is not durable: relations are nullable / `SetNull` / deletable, and history must survive the
   deletion of the originating lead. Denormalize the source onto the derived object at creation; treat it as immutable
   history thereafter.
3. **Governed taxonomy.** Source values come from a controlled channel list (the source inventory), so "revenue by
   source" groups cleanly and channels can be compared across asset classes (Model B: one acquisition platform, many
   channels).
4. **Revenue ≠ ROI.** Attribution makes *volume, conversion, and revenue* by source measurable. **ROI by source
   additionally needs cost-per-source** (channel spend), which attribution alone does not provide — that is a separate
   input.

### A distinct concern this rule does NOT cover

*Which tenant* may see an object is authority (see `AUTHORITY_PRINCIPLES.md`, Authority Rule 1). *Where an object came
from* is attribution. They are independent axes — do not conflate.
