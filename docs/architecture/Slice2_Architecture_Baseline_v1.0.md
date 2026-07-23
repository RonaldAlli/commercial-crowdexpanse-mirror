# Opportunity Pipeline — Slice 2 Architecture Baseline **v1.0**

> **A snapshot, not a design.** The single document to read before touching the pipeline. It records what is frozen,
> what the invariants are, how the layers depend, who owns what, how to extend it, and what is live in production.
> Everything here is realized and merged (E1–E7). 2026-07-23. Authoritative design detail lives in the linked
> contracts; this baseline is the map.

---

## 1. The seven layers

```
Truth        E1  Ledger              lib/pipeline-facts (service, registry)
  ↓          E2A Fact Graph          lib/pipeline-facts (fact-graph)
Reasoning    E2B Predicate Engine    lib/pipeline-predicates
  ↓
Permission   E3  Authorization       lib/pipeline-authorization
  ↓
Presentation E4  Projection          lib/pipeline-projection
  ↓
Migration    E5  Migration           lib/pipeline-migration
  ↓
Transport    E6  API (Coordinator)   lib/pipeline-api  +  app/api/pipeline/*
  ↓
Rendering    E7  View Models / UI     lib/pipeline-view-models  +  app/(workspace)/pipeline/*
  ⋯
(Automation) E8  Rule engine + runtime  — NOT built; runtime gated on D27
```

Each layer **consumes immutable outputs from the layer above**, exposes a **frozen contract**, has **explicit
invariants**, **deterministic** behavior, and **independent acceptance coverage**.

## 2. Frozen contracts (the stable surface)

| Contract | Path | Governs |
|---|---|---|
| Decision Log | `docs/releases/OPPORTUNITY_PIPELINE_SLICE2_DECISION_LOG.md` | all business decisions (OWN/OPP, fact families, GI-1/2/3) |
| Business Semantics Spec | `docs/architecture/BUSINESS_SEMANTICS_SPECIFICATION.md` | normative Phase-2 semantics |
| Engineering Constitution | `docs/architecture/OPPORTUNITY_PIPELINE_ENGINEERING_CONSTITUTION.md` | the 13 Laws + epic-exit gate |
| E1 Ledger API | `docs/architecture/E1_PUBLIC_API_CONTRACT.md` | `recordFact` · `recordSupersession` · `recordMigrationFact` · `reconstructHistory` · `activeFacts` |
| Fact Graph Contract / API | `docs/architecture/FACT_GRAPH_CONTRACT.md` · `FACT_GRAPH_PUBLIC_API.md` | `buildFactGraph` → immutable `FactGraph` |
| EvaluationResult/Artifact | `docs/architecture/EVALUATION_RESULT_CONTRACT.md` | `EvaluationArtifact { result, trace }` |
| Predicate Engine Design | `docs/architecture/PREDICATE_ENGINE_DESIGN.md` | the one evaluator + PE-INV-1..10 |
| Authorization Model / Design / Decision | `..._AUTHORIZATION_MODEL.md` · `E3_AUTHORIZATION_DESIGN.md` · `AUTHORIZATION_DECISION_CONTRACT.md` | `authorize` + commit guard; DENY §11a |
| ProjectionResult / E4 Design | `PROJECTION_RESULT_CONTRACT.md` · `E4_PROJECTION_DESIGN.md` | `project` → `ProjectionResult`; StageSpine |
| Migration Design | `E5_MIGRATION_DESIGN.md` | Plan/Execution + MIG-INV-1..5 |
| API / Error Contract / E6 Design | `API_CONTRACT.md` · `API_ERROR_CONTRACT.md` · `E6_API_DESIGN.md` | Coordinator, DTOs, error taxonomy |
| UI View-Model / E7 Design | `UI_VIEW_MODEL_CONTRACT.md` · `E7_UI_DESIGN.md` | view models + UI-INV-1..5 |
| AutomationEvent | `AUTOMATION_EVENT_CONTRACT.md` | (pre-E8) the event + AUTO-INV-1..3 |
| Glossary | `docs/architecture/GLOSSARY.md` | terminology across all layers |

## 3. Invariant registry

- **Globals** GI-1 (facts append-only) · GI-2 (deterministic evaluator) · GI-3 (Artifact/Evidence/Decision).
- **Constitution Laws 1–13** — incl. Law 4 (derived disposable), Law 6 (one evaluator), Law 8 (authz on facts,
  observational), Law 11 (impl≤acceptance), Law 12 (one Fact Graph Builder), Law 13 (consumers reason only over the
  FactGraph).
- **FG-INV-1..12** (Fact Graph) · **PE-INV-1..10** (Predicate Engine) · **AUTH-INV-1..14** (Authorization) ·
  **PR-INV-1..10** (Projection) · **MIG-INV-1..5** (Migration) · **API-INV-1..3** (API) · **UI-INV-1..5** (UI) ·
  **AUTO-INV-1..3** (Automation, pre-E8).

## 4. Dependency graph (data flow)

```
PipelineFact ledger ──reconstructHistory──▶ FactGraph ──▶ Predicate Engine ──EvaluationArtifact──┐
                                                │                                                 ├─▶ Authorization ──AuthorizationDecision──┐
                                                └──active Decision Facts──▶ Projection ──ProjectionResult──┐                                 │
Migration ──recordMigrationFact──▶ ledger                                                                  ├─▶ API Coordinator (commit) ─────┤
                                                                                                           └──▶ View Models ──▶ UI           │
                                                                                                                                (AutomationEvent)┘→ E8 (deferred)
```
Rules: **stage** is a pure furthest-fact projection over active Decision Facts (never from predicates directly,
PR-INV-10); **authorization** is on fact operations, never stages (Law 8); the **one evaluator** serves authz +
projection-inputs + what-if + tests (Law 6); every consumer reasons only over the layer above (Law 13 / FG-INV-12 /
PR-INV-4 / API-INV-1 / UI-INV-1/2).

## 5. Subsystem ownership

| Module | Owns | Must NOT |
|---|---|---|
| `lib/pipeline-facts` (service) | append-only ledger; record/reconstruct | mutate/delete; project; authorize |
| `lib/pipeline-facts` (fact-graph) | the ONE ledger interpretation (Law 12) | predicate eval; projection; authz |
| `lib/pipeline-predicates` | the ONE evaluator + versioned predicates | project; authorize; mutate; read ledger |
| `lib/pipeline-authorization` | `authorize` (pure) + `revalidateForCommit` | evaluate; reconstruct; project |
| `lib/pipeline-projection` | stage projection over active Decision Facts | evaluate; authorize; mutate |
| `lib/pipeline-migration` | classify legacy → Plan/Execution | infer; synthesize evidence; edit source |
| `lib/pipeline-api` | orchestration + tx-scoped commit | any business logic |
| `lib/pipeline-view-models` | shape contracts → view models | reinterpret; derive truth |

## 6. Extension points + additive-versioning rules

- **New predicate** → add to the evaluator registry under a `ruleSetVersion` (never edit a frozen rule-set).
- **New authorization policy** → new `AuthorizationPolicy` (`policyId`/`policyVersion`), data not code.
- **New migration mapping** → new `mappingVersion` (old plans stay reproducible, MIG-INV-4).
- **New stage / progression** → new `StageSpine` version (additive/reordered/retired; never in-place).
- **New projection presentation** → bump `projectionVersion` (orthogonal to spine).
- **New view model / panel** → extend the presentation tier; never reach into subsystem objects (UI-INV-2).
- **Any new business concept** → **return to the Decision process** (Constitution Law 3/10) — never an ad-hoc code
  change. **Every PR cites the Traceability Matrix** (`Code → Architecture → Spec → Decision`).
- Frozen-contract change: additive ⇒ minor bump; breaking ⇒ major bump + decision process.

## 7. Implementation & production status

| Epic | Status | Tag | Prod |
|---|---|---|---|
| E1 Ledger | ✅ merged | `opp-slice2-e1-complete` | table `pipeline_facts` **deployed** (migration 31) |
| E2A Fact Graph / E2B Predicate Engine (+B.1–B.4) | ✅ merged | `opp-slice2-e2a…e2b4-complete` | library only |
| E3 Authorization | ✅ merged | `opp-slice2-e3-complete` | library only |
| E4 Projection | ✅ merged | `opp-slice2-e4-complete` | library only |
| E5 Migration | ✅ merged | `opp-slice2-e5-complete` | library only (prod data migration = separately-authorized, not run) |
| E6 API | ✅ merged | `opp-slice2-e6-complete` | table `api_idempotency_records` **deployed** (migration 32) |
| E7 UI | ✅ merged | `opp-slice2-e7-complete` | **code + authenticated routes DEPLOYED 2026-07-23, DORMANT** (see below) |
| E8 Automation | ⏸ deferred | — | rule engine buildable; **runtime gated on D27** (scheduler OFF) |

**Migration history (prod):** 30 legacy → **31** `add_pipeline_facts` → **32** `add_api_idempotency`. Both additive;
zero existing data modified; restore-verified backups taken each time.

**Production deployment status (updated 2026-07-23).** Slice 2 code and its authenticated routes are now **deployed
but dormant.** The first production build to carry Slice 2 shipped 2026-07-23 (release `r723981950001803`, atop the
Seller Acquisition "Promote" feature, main `c160474`) via the D25 engine — previously prod ran D19-era `61d130f`
and Slice 2 was "source only." What "dormant" means, as verified live post-deploy:
- `/pipeline/[opportunityId]` (screen) and `/api/pipeline/[opportunityId]` (read) **initialize cleanly** (HTTP 200
  over zero facts) but are **not in navigation** and **not referenced by any live workflow** (disjoint from legacy).
- Anonymous access is blocked (middleware → 307). **`pipeline_facts` and `api_idempotency_records` remain at 0 rows**
  — deployment and read-only exercise created no pipeline data.
- Automation process absent from pm2; scheduler OFF; D27 posture unchanged.

**Business activation and navigation exposure remain DEFERRED** to the separately-recorded
`docs/roadmap/OPPORTUNITY_PIPELINE_MIGRATION_INITIATIVE.md`.

> ⚠️ **Pre-activation security item (dormant, not a live regression).** The `/api/pipeline/[opportunityId]` GET adapter
> takes `organizationId` from the query string and does not constrain it to the caller's session org — so an
> *authenticated* user could read another org's pipeline projection (cross-org IDOR). It is **not anonymously
> exploitable** (auth-gated) and the route is unlinked/dormant, so it is not a regression of existing behavior — but it
> **must be fixed before the pipeline is activated.** Tracked as an entry for the Migration Initiative / Slice 3 authz
> hardening.

## 8. Gates & process (how work ships)

Per slice: `Design → freeze contract → implement in the worktree → Epic Exit Gate green → founder acceptance →
FF-merge → tag`. Gate = `tsc 0 · e2e (53 suites) · unit (73) · build:isolated`. **CODE gates in the worktree
`/opt/crowdexpanse/wt-roadmap`** (the prod checkout's `.next` symlink breaks dev `tsc`); **docs may go direct to
main only when no branch is outstanding.** Prod migrations are separately authorized with the operational checklist.

## 9. When work resumes (recommended order)

1. Read this baseline.
2. Resolve **D27** (pm2/SIGINT process-supervision investigation) — prerequisite for any automation runtime.
3. Implement the **deterministic Automation Rule Engine** (design-first against the frozen `AutomationEvent`).
4. Enable **AutomationExecution** only after D27 is complete (scheduler stays OFF until then).

## 10. Deferred future-work notes (do at the start of the relevant phase, not before)

Recorded here so they surface at the right time — not created now (each belongs at the beginning of its phase, like
this baseline belonged at the end of Slice 2).

- **At Slice 3 start — `ARCHITECTURAL_DECISION_INDEX.md`.** Not another design doc, but the *table of contents* for
  the whole architecture: an index of every frozen contract, invariant family, public API, additive version,
  production migration, and tagged milestone. This baseline is the Slice-2 snapshot; the index is the cross-slice
  locator.
- **At the start of a broader operational phase — `OPERATIONS_RUNBOOK.md`** (cross-project). An *operations manual*
  (distinct from the architectural docs): incident-response workflow · production evidence collection · signal
  attribution (D27's `scripts/d27-signal-watch.sh` is a first entry) · pm2 diagnostics · deployment rollback (D25/
  D26) · database restore verification (`scripts/backup.sh`) · production health verification · postmortem template.
  Shared across DealFlow / Communications / Automation / Genufly / CrowdExpanse to avoid duplicated procedures.
