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

## The three-layer attribution model

Attribution is not one field — it is three layers, captured on the lead and retained downstream. You can always
aggregate upward (event → campaign → channel):

| Layer | Changes | Governed? | Example |
|---|---|---|---|
| **Channel** | rarely | **yes** — a controlled taxonomy | `OWNER_DIRECT` |
| **Campaign** | often | no — free-form label | `Fulton Probate July 2026` |
| **Acquisition Event** | per import | no — the concrete batch/import | `Import Batch #2026-07-23-01` |

This answers three business questions at once: *which channels work · which campaigns work · which individual imports
worked.* Two design constraints govern the **channel** layer specifically:

- **Stable** — do not mint a new channel every month. Channels change rarely; campaigns/batches/lists/vendors carry
  the frequent change.
- **Actionable** — every channel must be something you could reasonably decide to invest *more* in, or *stop*
  investing in. If it isn't a budget lever, it's a campaign, not a channel.

### Canonical channel taxonomy (initial, Model B — coexisting across asset classes)

**Commercial:** `OWNER_DIRECT` · `COMMERCIAL_BROKER` · `CREXI` · `LOOPNET` · `COSTAR` · `COUNTY_RECORDS` ·
`TAX_DELINQUENT` · `BANK_SPECIAL_SERVICER` · `RECEIVERSHIP` · `AUCTION` · `REFERRAL` · `OUTBOUND_CALLING` ·
`DIRECT_MAIL` · `EMAIL_OUTREACH` · `WEB_INBOUND`

**Residential / DealFlow:** `DEALFLOW_PROBATE` · `DEALFLOW_FSBO` · `DEALFLOW_EXPIRED` · `DEALFLOW_VACANT` ·
`DEALFLOW_PREFORECLOSURE` · `DEALFLOW_TAX_DELINQUENT` · `DEALFLOW_REFERRAL`

The taxonomy is a **business classification** — the software preserves it faithfully; it does not invent it. Changing
it is a business decision, not a code change.

## Authority vs Attribution — orthogonal axes

> **Authority answers *who may act*. Attribution answers *why this opportunity exists*.**

One protects the platform (`AUTHORITY_PRINCIPLES.md`, Authority Rule 1); the other measures the business (this
document). They are independent — never conflate the tenant an object belongs to with the source it came from.
