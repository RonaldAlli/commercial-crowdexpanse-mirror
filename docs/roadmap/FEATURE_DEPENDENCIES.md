# Feature Dependencies

> What must exist before what. Read top-to-bottom: lower layers enable higher ones. Nothing higher ships before its prerequisites are trusted.

## Dependency graph (foundation → automation)

```
Organization / Multi-Tenancy (root invariant)
        │
        ├── Authentication & Sessions ── Team Management ── Invitations
        │
        ├── Seller Records ─┐
        ├── Buyer Records   ├── (all org-scoped, list-enabled via Better Lists)
        ├── Property Records┘
        │        │
        │        └── Opportunities / Pipeline
        │                 ├── Deal Analyzer / Underwriting (1.3)
        │                 ├── Buyer Matching  ── Dispositions
        │                 └── Tasks · Notes · Documents · Activity/Notifications
        │
        ├── Global Search (spans all records)
        │
        └── Better Lists (cross-cutting list capability)

Testing & CI  ── underpins everything (a change isn't done without it)
```

## Release-level dependencies

| Release | Requires (must be trusted first) |
|---|---|
| 1.1 Operational Excellence | 1.0 core records + pipeline; Testing/CI foundation |
| 1.2 Commercial Intelligence | 1.1 permissions; schema-migration decision; data-source/legal calls |
| 1.3 Commercial Underwriting | Analyzer foundation; Documents (T12/rent roll); 1.2 inputs (soft) |
| 1.4 Closing Center | Pipeline; Buyer Matching; Documents; Tasks; Notifications; 1.3 offer artifacts |
| 2.0 Automation & AI | **1.1–1.4 complete and trusted** (AI only over existing workflows) |

## Hard rules
1. **Org scoping precedes every feature** — no module ships without org isolation + an E2E asserting it.
2. **Better Lists precedes list polish** — new list capabilities extend `lib/list-params.ts`, not bespoke code.
3. **Underwriting math precedes underwriting UI** — pure, unit-tested formulas before surfacing metrics.
4. **Closing gates precede `PAID`** — an opportunity can't complete without its closing checklist (1.4).
5. **Workflows precede AI** — every 2.0 AI capability augments a deterministic workflow that already exists and has a fallback.

## Cross-cutting enablers (needed by many)
- **Schema migrations** (blocks 1.2+): ✅ resolved in 3a-i — `prisma migrate` with a `0_init` baseline; test/CI run `migrate deploy`.
- **Object storage** (blocks Documents scale / 1.4): local FS → S3-class.
- **Email transport** (blocks Invitations delivery / Notifications / 2.0 campaigns).
- **Permission matrix** (blocks safe multi-role operation across 1.1+).
