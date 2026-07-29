# BE-3 Candidate Identity Hardening — Increment 5A Implementation Report

> **Scope: the versioned evidence-container FOUNDATION only.** Increment 5A introduces
> `migrationSchemaVersion` (`msv-1`) and an immutable **Evidence Manifest** with deterministic
> construction, canonical serialization, a SHA-256 digest, and manifest compatibility validation that
> **suspends** on any governed-identifier mismatch. It is **isolated, read-only, deterministic, and
> non-authoritative**. It does **not** run the readiness corpus, generate readiness evidence, propose or
> accept a baseline, create a tag, or switch authority. `civ-1` remains authoritative; `civ-2` remains
> non-authoritative. Governance context: `CANDIDATE_IDENTITY_INCREMENT5_PLAN.md` §3a,
> `../CANDIDATE_IDENTITY_HARDENING_PLAN.md`, [[crowdexpanse-be-lifecycle]]. This increment discharges the
> Increment 4 acceptance observation calling for an independent `migrationSchemaVersion`.

> **migrationSchemaVersion versions the migration-evidence structure and semantics. It does not version
> candidate identity.**
>
> **The Evidence Manifest establishes reproducibility metadata. It does not authorize a baseline or an
> authority switch.**

## What was built

| File | Role |
|---|---|
| `lib/governance/be3-evidence-manifest.ts` | versioned evidence-manifest module: `migrationSchemaVersion` (`msv-1`), immutable `EvidenceManifest` type, deterministic `constructManifest`, canonical serializer + `manifestDigest`, `validateManifest` compatibility contract |
| `scripts/diag/be3-evidence-manifest.ts` | diagnostic CLI (read-only; explicit `--json-out`; refuses accepted-evidence paths) |
| `tests/unit/governance/be3-evidence-manifest.test.ts` | 23 focused tests (deterministic / compatibility / immutability) |
| `CANDIDATE_IDENTITY_INCREMENT5A_REPORT.md` | this implementation report |

## Design decisions (governed)

- **`generatedAt` policy — EXPLICIT INPUT, never wall-clock.** `generatedAt` is a supplied field of the
  manifest and participates in the canonical form and digest. Reproducibility holds by *same-input →
  same-output*, not by reading a clock. No `Date.now()`, `Math.random()`, or environment reads exist in
  the module. `generatedAt` is **provenance, not a compatibility field** — it is excluded from
  `GOVERNED_COMPAT_FIELDS`, so a differing timestamp alone never suspends generation (proven by test).
- **Strict construction.** Unknown fields are **rejected** (explicit policy), as are missing, empty,
  non-string, or delimiter-bearing fields. There is no coercion and no defaulting.
- **No automatic schema upgrade.** `SUPPORTED_MIGRATION_SCHEMA_VERSIONS = ["msv-1"]`; any other value is
  rejected at construction and, if it reaches validation, suspends. There is no silent substitution.
- **Suspend-not-fallback.** Any governed-identifier mismatch yields `mode:"suspended"`,
  `evidenceGeneration:"skipped"`, and lists every incompatibility in fixed field precedence order.
- **Baseline/authority are structurally pinned to `none`.** `baselineProposal` and `authorityChange` are
  the literal type `"none"` in Increment 5A — the foundation cannot, by construction, propose a baseline
  or switch authority.
- **Determinism primitives.** Fixed `MANIFEST_FIELD_ORDER`, ASCII unit-separator (``) delimiter
  rejected inside values, `Object.freeze` on the constructed manifest, SHA-256 over the canonical form.

## Results classification

**Proven (23/23 tests green):**
- Valid `msv-1` manifest constructs; repeated construction is **byte-identical** (canonical + digest).
- **Input ordering does not affect output** — a key-shuffled input yields an identical canonical form and
  digest.
- `generatedAt` is an **explicit deterministic input**: its value comes from input, a different
  `generatedAt` changes the digest, yet `generatedAt` alone is **not** a compatibility field.
- **Each** governed-field mismatch **suspends** (`evidenceGeneration:"skipped"`), with
  `baselineProposal:"none"` and `authorityChange:"none"` in every case.
- **Multiple** mismatches are reported together in **deterministic field precedence order**.
- Input objects remain **unmodified**; a frozen input is accepted without mutation.
- Canonical digest is **stable across repeated runs**; `stableStringify` is deterministic.

**Suspended-by-design:**
- Any governed-identifier mismatch (`findingIdentityVersion`, `candidateIdentityVersion`,
  `classificationAlgorithmVersion`, `migrationSchemaVersion`, `detectorVersion`, `ruleSetHash`,
  `scopeHash`, `measurementSeriesId`, `baselineTag`, `generatorVersion`) suspends generation — no
  fallback, no substitution.

**Rejected-as-invalid (at construction):**
- Unknown field, missing field, empty/non-string field, delimiter-bearing value.

**Intentionally-unsupported:**
- `migrationSchemaVersion` values other than `msv-1` — rejected; **no automatic schema upgrade**.

**Deferred (NOT in 5A — require separate governed authorization):**
- Corpus rerun, readiness-evidence generation, baseline proposal/acceptance, tag creation, authority
  switch (`civ-1` → `civ-2`), production integration, Blocking Mode planning. Increment 5A is the
  container; it holds no readiness evidence.

## Isolation verification

- Increments 1–4 modules (`be3-candidate-identity.ts`, `be3-compatibility-contract.ts`,
  `be3-candidate-lineage.ts`, `be3-candidate-migration.ts`) are **byte-identical** to `origin/main`
  (`git diff --quiet` — recorded in the PR).
- No accepted evidence, baseline, acceptance record, detector, or classifier was modified. All new files
  are **additive**. The CLI **refuses** to write into accepted-evidence paths (proven).

## Boundaries this report does NOT assert

No baseline is proposed or accepted; no tag exists; no authority is switched; no readiness evidence is
produced. This report certifies only that the versioned evidence-container foundation is deterministic,
immutable, strict, suspend-safe, and isolated — pending the **Increment 5A Evidence Manifest Review**.
