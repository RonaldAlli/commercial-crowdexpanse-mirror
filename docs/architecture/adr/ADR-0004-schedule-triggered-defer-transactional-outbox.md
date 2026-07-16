# ADR-0004 — Schedule-triggered in 2.0.1; defer the transactional outbox to 2.0.2

**Status:** Decision **accepted** within the FOUNDER RATIFIED Automation architecture
(2026-07-16). **Implementation FOUNDER APPROVED FOR IMPLEMENTATION** (Phase 2.0.1).

## Context

The ratified architecture prefers **event-driven** triggering via a **transactional outbox**
(A6): a domain write and the automation job it triggers should commit atomically in the same
transaction, so no trigger is ever lost or duplicated. Grounded facts:

- The email outbox is a **partial transactional-outbox precedent** — but its write is currently **decoupled** from the domain `$transaction` (best-effort, `settings/team/actions.ts:273-283`), i.e. eventually-consistent, not atomic.
- Enrolling automation-job creation in a domain write's `$transaction` means **touching existing domain write paths** across V1.x code.
- Phase 2.0.1's mandate is to prove the *spine* (scheduling, execution, policy, audit, retry, dedup, isolation) with **zero change to any existing domain transaction** and no risk to frozen V1.3/V1.4 behavior.

## Decision

**Phase 2.0.1 is schedule-triggered.** The scheduler loop creates jobs on a periodic cadence
(the closing-readiness observation proof job), using `occurrenceKey` time-buckets for
idempotency. **No existing domain write path is modified.**

The **transactional-outbox seam is designed but not built**: because the `AutomationJob`
table is transactional (ADR-0001), a future phase can write a job row *in the same
`$transaction` as the triggering domain write* behind the same table contract. That
event-driven coupling is **deferred to Phase 2.0.2**.

## Consequences

**Positive**
- 2.0.1 touches **no** V1.x domain transaction — the frozen behavior and the composed PAID gate are provably unaffected.
- The spine is fully exercised by a schedule trigger alone; event-driven triggering is an additive follow-on, not a prerequisite.
- The chosen DB-backed queue (ADR-0001) already supports the future atomic enrollment with no redesign.

**Negative / trade-offs**
- Schedule triggering has coarser latency than event triggering (a job runs on the next scheduler tick, not the instant a domain event occurs) — acceptable for an observation job and irrelevant to correctness.
- The transactional-outbox benefit (exactly-once atomic triggering) is not realized until 2.0.2.

## Alternatives considered

- **Build the transactional outbox now (2.0.1):** rejected — requires modifying existing domain write paths, enlarging blast radius against frozen code, for no additional proof value in the spine phase.
- **Trigger from `ActivityLog` as an event stream:** rejected — `ActivityLog` is explicitly **best-effort** (`.catch(() => {})`), so it is not a reliable bus; using it for triggering would drop events silently.

## Traceability

A6 (event-driven preferred, not forced) · Implementation Plan **Determinations 6 & 7** ·
§13/§17 deferrals (→ Phase 2.0.2).
