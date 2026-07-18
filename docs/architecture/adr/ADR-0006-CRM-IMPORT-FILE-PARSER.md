# ADR-0006 — CRM Lead-Import File Parser

> **Status: PENDING FOUNDER RATIFICATION.** Decision record for how the DealAutomator lead-import
> feature parses uploaded files. Companion to the [CRM Reconciliation
> Acceptance](../../releases/CRM_PRODUCTION_RECONCILIATION_ACCEPTANCE.md) and [CRM Operations
> Boundary](../CRM_OPERATIONS_BOUNDARY.md).

## Context

The lead-import feature ingests third-party lead exports (DealAutomator) to create
`Owner`/`Property`/`Opportunity`/`Note` records. The live production implementation accepted
`.json/.csv/.tsv/.txt/.xlsx/.xls` and parsed Excel with **SheetJS `xlsx@0.18.5`**.

The stabilization audit found the Excel path parses **untrusted files** with a **known-risk
parser and no pre-parse resource limits**.

## Business requirement

- **Formats required:** DealAutomator exports are available as **CSV**; CSV/TSV/JSON fully
  satisfy the current import requirement. Excel is **not materially necessary** for the first
  stable release.

## Security findings (xlsx@0.18.5, npm)

- **CVE-2023-30533** — prototype pollution; **CVE-2024-22363** — ReDoS. SheetJS ships fixes via
  its own CDN for newer versions, **not npm**; `0.18.5` is the last npm-published version.
- `XLSX.read` was called with **no `sheetRows` / file-size guard** → memory-exhaustion /
  decompression-bomb exposure; `--limit` was applied **after** full parse.

## Decision — **Option A: CSV-only intake**

Disable `.xlsx`/`.xls`; **remove the `xlsx` dependency entirely**; parse only CSV/TSV/TXT/JSON via
the existing bounded delimited/JSON parser.

### Rejected options
- **Option B (retain Excel with a safer parser):** rejected for the first release — Excel is not
  required; keeping any workbook parser enlarges the untrusted-parse surface. Revisit only if a
  concrete Excel requirement appears, and then with a maintained/pinned parser + strict limits.
- **Keep xlsx@0.18.5 as-is:** rejected — a known-risk parser must not stay in an untrusted-file
  path merely because production has not yet been exploited.

## Consequences / controls implemented

- `xlsx` removed from `package.json`, `package-lock.json`, and the dependency tree
  (`npm ls xlsx` → empty). The SheetJS untrusted-parse surface is **eliminated**.
- `loadRecords` rejects `.xlsx`/`.xls` explicitly and any unsupported extension.
- **Pre-parse file-size cap** (`MAX_IMPORT_FILE_BYTES` = 15 MB) enforced via `stat` **before**
  reading the file.
- **Row / column / cell-length limits** enforced during parsing (`MAX_IMPORT_ROWS` = 50,000,
  `MAX_IMPORT_COLUMNS` = 200, `MAX_CELL_LENGTH` = 20,000) — before materializing records.
- Upload extension allowlist tightened to CSV/TSV/TXT/JSON; upload size already capped
  (`MAX_UPLOAD_BYTES`); import is **ADMIN-only**; the importer runs **detached** (a parse failure
  cannot take down the web process); `spawn` uses **array args** (no shell injection); path
  traversal guarded (`assertSafeImportPath`); temporary job files live under a fixed server dir;
  the importer verifies **actor↔organization membership** and records `organizationId` provenance.

### Provenance / rollback
- Imported records retain their source provenance and stay within the actor's organization.
- Rollback: this is code-only on a review branch; production is unchanged. Reintroducing Excel is
  a separate, ratified decision (Option B) — not a silent revert.

### Residual / out of scope
- `npm audit` still reports **pre-existing platform-dependency advisories** (Next.js image
  optimization, etc.) that exist independently of this change (present at the `v1.4.0` baseline).
  They are **not** in the untrusted-file parser path and are tracked as separate platform-upgrade
  debt — not resolved by this ADR.
