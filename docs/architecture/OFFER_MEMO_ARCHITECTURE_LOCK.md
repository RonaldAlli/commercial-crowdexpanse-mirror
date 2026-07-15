# Offer-Memo Architecture Lock

> **Status: ✅ SHIPPED (2026-07-15).** Live in production — migration `20260715220000`
> applied (prod 21→22), serving build `OuE0HfLIzVy6LsKqzp3ct`, feature commit `5629e8a`.
> All invariants OM-1…OM-12 realized and verified (unit + E2E sections [18]/[18b],
> including a live sequence-conflict proving compensating cleanup). Output format:
> self-contained HTML. LOI generation and PDF output remain deferred to later sibling
> slices. This completes the final Version 1.3 Definition-of-Done item.

Design authority for **offer-memo generation** — the final open Version 1.3
Definition-of-Done item ("an offer memo can be generated from a model"). Ratified
by the founder on 2026-07-15. This lock is downstream of, and never reopens, the
[Underwriting Architecture Lock](./UNDERWRITING_ARCHITECTURE_LOCK.md) (U-H:
"Documents own reports/exports (offer memo / LOI), not the calc core") and the
[Calculation Principles](./UNDERWRITING_CALCULATION_PRINCIPLES.md) (Principle 5 —
reading settled results is never a computation that entangles them; Principle 7 /
UW-7 — a consumer never feeds back into a calculation).

An offer memo is a **generated business document**, not a calculation surface. It
therefore follows the operational-record discipline of the human decision layer
(3d) far more than the deterministic-projection discipline of the engine: it is a
faithful, immutable, snapshot-bound rendering of what the model said at one moment,
retained as historical evidence.

## 1. Scope

Ships the **minimum shared generated-document foundation + Offer Memo only**, as a
deterministic **self-contained HTML** artifact.

Out of scope for this commit (each separately gated): **LOI generation** (the
`DocumentType.LOI` value may remain for a later sibling slice — no LOI template,
UI, or workflow now), **PDF / browser-automation / DOCX / external rendering**,
generated-document **deletion or archive**, emailing / sending, e-signature,
user-editable or multi-template libraries, AI narrative (U-I / 2.0), workflow
automation, notifications, multi-stage approvals, and bulk generation.

## 2. Load-bearing boundary

```
Persisted LOCKED Scenario
        │  read only  (Underwriting: getScenarioForMemo — narrow, org-scoped, fail-closed)
        ▼
OfferMemoSnapshot assembler   (Documents-owned, pure: bundle + meta → canonical snapshot)
        │  plain serializable data
        ▼
Offer-memo template renderer  (Documents-owned, pure: snapshot → deterministic HTML bytes)
        │  deterministic bytes
        ▼
Documents-owned storage + lifecycle  (persist, hash, append-only Document row, retrieval)
```

- **Underwriting never imports Documents** (OM-10). It exposes exactly one narrow
  read — `getScenarioForMemo` — returning a typed bundle of already-persisted rows.
- **Documents reads Underwriting** through that read only. Documents owns the
  snapshot shape, the template, generation, files, storage, retrieval, and lifecycle.
- **No calculation module knows a memo exists.** Generation performs **no
  calculation and triggers no rebuild** (OM-3). `lib/analysis.ts` and every pure
  underwriting module are untouched.

## 3. Source of truth & fail-closed preconditions (OM-A/OM-B)

A memo is generated **only from a LOCKED Scenario**. `getScenarioForMemo` fails
closed (throws, no artifact, no row) when:

- the Scenario is **DRAFT** (or SUPERSEDED — only a currently LOCKED scenario);
- the Scenario belongs to **another organization**;
- the settled **`ScenarioResult`** is absent;
- there is **no primary `FinancingCase`** (position 0), or its **`FinancingCaseResult`
  is absent**.

> v1 constraint: a memo requires a primary FinancingCase with a settled result.
> All-cash-only memos (no financing case) are deferred — consistent with the
> ratified fail-closed condition "the primary FinancingCase or required result
> surfaces are missing."

## 4. Canonical source snapshot (OM-E)

At generation the service captures an **immutable canonical snapshot** containing
**exactly** the values the renderer uses — nothing more. It includes, when
applicable: organization-safe display info; opportunity identity; property identity
+ address fields; Scenario id, version number, status, `scenarioVersion`;
`findingsVersion`; the displayed operating assumptions; the displayed `ScenarioResult`
values; the primary FinancingCase identity, position, capital assumptions, and
result values; exit + equity-return values; displayed findings; the suggested
recommendation; the current `UnderwritingDecision` if one exists (id, sequence,
level, rationale, actor display value, timestamp); the template version; generator
version; snapshot-schema version; the generation timestamp; and the generating user
identity.

It must **not** contain secrets, internal-only fields, session data, raw
authorization data, storage paths, or unrelated database fields.

The renderer accepts this snapshot **alone** — it never queries Prisma, reads the
current user, inspects the clock, performs calculations, or reads current Scenario
state.

## 5. Determinism & reproducibility (OM-F)

The renderer is a pure function of the snapshot. It uses: canonical key/array
ordering; explicit numeric formatting (hand-rolled USD/percent/multiple formatters —
no locale-dependent `Intl` defaults); an explicit UTC date/time policy; safe HTML
escaping of every data-derived string; and **no** external scripts, stylesheets,
fonts, images, or network references, **no** randomness, and **no** `Date.now()`
inside the renderer (the generation timestamp is passed in via the snapshot).

Every memo records `templateVersion`, `generatorVersion`, `snapshotSchemaVersion`,
and the **SHA-256 hash of the final stored bytes** (OM-5/OM-6). Re-rendering the
same snapshot under the same recorded versions yields byte-identical output; the
**stored artifact + its hash are the authoritative historical evidence**.

## 6. Persistence & lifecycle (OM-G/OM-H/OM-I)

The existing `Document` model is **extended additively** with a `DocumentOrigin`
discriminator (`UPLOADED` | `GENERATED`; existing rows default `UPLOADED`) and
nullable generation-provenance columns. Uploaded documents leave them null;
generated Offer Memos must carry complete provenance (enforced by the service).

Generation is **append-only**: each generation creates a **new immutable `Document`
row + stored artifact**, with a monotonic **`generationSequence`** per
(`sourceScenarioId`, `documentType`). Regeneration **never** overwrites the prior
row, storage key, bytes, snapshot, or hash. There is **no "active memo" pointer** —
"latest" is the highest sequence. **Deletion/archive of generated memos is not
added in this commit**; existing upload deletion is unchanged.

## 7. Recommendation treatment (OM-J)

The memo shows the engine's **suggestion** (PROCEED / PROCEED_WITH_CONDITIONS /
PASS) and the **human decision** (APPROVED / DECLINED / DEFERRED, or "No human
decision recorded") as **two distinct fields** — never merged. A memo generated
before a later decision remains unchanged; a new decision requires generating a new
memo to include it (OM-8).

## 8. RBAC & audit (OM-K/OM-12)

Generation crosses two protected domains and requires **both** `UNDERWRITING` read
(to see the scenario) **and** `DOCUMENT` write (to create the artifact). It does
**not** require `UNDERWRITING_APPROVAL` — that resource governs *making* a decision,
not *reporting* an existing one. Download continues to require org-scoped `DOCUMENT`
read via the existing route. No new RBAC resource is introduced. Generation and
retrieval are organization-scoped, authorized, path-safe, and audited (an
`offer_memo.generated` ActivityLog event after both row and artifact exist).

## 9. Failure-safe generation order (OM-L)

Given the storage API (`lib/storage.ts` exposes `persistFile`/`removeFile` — no
temp+rename primitive), the ordering that cannot leave an accessible `Document` row
pointing to a missing artifact is **file-first**:

1. Authorize (both checks) and read the bundle via `getScenarioForMemo`.
2. Assemble the canonical snapshot (the only clock read — for `generatedAt`).
3. Render deterministic bytes in memory; compute SHA-256.
4. Allocate the final org-scoped storage key.
5. **Persist the bytes to the final key** (file exists before any row).
6. In a transaction: reserve `generationSequence` (max + 1 for this scenario/type)
   and create the `Document` row.
7. If the transaction fails, **remove the just-written file** (compensating
   cleanup) — no row was created, and no orphan file remains.
8. Record the success ActivityLog only after both the row and artifact exist.

A `Document` row is thus never created before its bytes exist; the only possible
residue on a mid-failure is unreferenced bytes with no row (never served), which is
strictly safer than a row → missing file. The unique index on
(`sourceScenarioId`, `documentType`, `generationSequence`) makes the sequence
reservation race-safe.

## 10. Locked invariants

- **OM-1** — Offer Memos are Documents-owned generated artifacts.
- **OM-2** — Only a LOCKED Scenario may generate an Offer Memo.
- **OM-3** — Generation reads persisted settled outputs and performs no underwriting
  calculation or rebuild.
- **OM-4** — Every memo captures an immutable canonical source snapshot.
- **OM-5** — Every memo records template, generator, and snapshot-schema versions.
- **OM-6** — Every generated artifact records a SHA-256 hash of its stored bytes.
- **OM-7** — Generated artifacts are append-only; regeneration creates a new sequence.
- **OM-8** — Later Scenario, findings, recommendation, or decision changes never
  modify an existing memo.
- **OM-9** — Suggested recommendation and human decision remain distinct snapshot fields.
- **OM-10** — Underwriting never imports or depends on Documents.
- **OM-11** — A generated document is never an underwriting, findings, recommendation,
  or decision input.
- **OM-12** — Generation and retrieval are organization-scoped, authorized, path-safe,
  and audited.

## 11. Affected modules

- **New** `docs/architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md` (this file).
- **New** additive migration: `DocumentOrigin` enum + nullable `Document`
  generation-provenance columns + unique index.
- **New** `lib/documents/offer-memo.ts` — version constants, `OfferMemoSnapshot`
  type, pure `assembleOfferMemoSnapshot`, pure `renderOfferMemoHtml`, pure
  formatters + HTML escaping, `sha256Hex` (CRITICAL, unit-tested ≥90% branch).
- **New** `lib/documents/offer-memo-service.ts` — `generateOfferMemo` (failure-safe
  orchestration) + `listGeneratedMemos`.
- **Underwriting** `lib/underwriting.ts` — adds only the narrow read
  `getScenarioForMemo` (no calc change; imports nothing from Documents).
- **UI/action** — a `generateOfferMemo` server action + a generate control and
  generated-memo history on the LOCKED-scenario analyzer card; a GENERATED/UPLOADED
  origin badge on the documents list.
- The existing `/documents/[id]/download` route is unchanged (it already serves
  `document.mimeType` inline / attachment).

**Untouched:** `lib/analysis.ts`, every pure underwriting calculation module,
model-version / fingerprint logic, findings rules + rebuild, `UnderwritingDecision`
mutation semantics, Scenario lifecycle semantics.
