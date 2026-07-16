# ADR-0005 — Automation Principal via an additive `ActivityLog` discriminator

**Status:** Decision **accepted** within the FOUNDER RATIFIED Automation architecture
(2026-07-16). **Implementation FOUNDER APPROVED FOR IMPLEMENTATION** (Phase 2.0.1).

## Context

AU-3 requires an **Automation Principal** that acts as `AUTOMATION` and **never impersonates a
user**, and the Principal must "produce explicit `ActivityLog` attribution." Grounded facts:

- `ActivityLog.actorId` is `String?` **but a hard FK to `User`** (`onDelete: SetNull`, `prisma/schema.prisma:1766`). Any non-null value must reference a real `users.id`.
- **There is no non-user actor concept today.** The only non-human option is `actorId: null` — a "system event" that carries **no identity** (`notifications.ts:13-19`) and is indistinguishable from any other null-actor row.
- `User` rows carry `hashedPassword` (required) and a `role`; every user is a human login.

A named, non-impersonating Automation Principal therefore **has no representation** without a
schema change.

## Decision

Extend `ActivityLog` **additively** with:
- `actorType ActorType @default(USER)` — enum `USER | SYSTEM | AUTOMATION | WEBHOOK`.
- `automationExecutionId String?` — a **scalar** (not an FK; history-safe like `RefreshJob.actorUserId`), nullable, linking an automation-emitted row to the execution that produced it.

Human writes and every existing row default to `actorType = USER` with `actorId` set as
today — **zero behavior change**. Automation rows set `actorId = null`,
`actorType = AUTOMATION`, `automationExecutionId = <execution>`, and a distinct
`automation.*` eventType namespace. The in-code `AutomationPrincipal` (type `AUTOMATION`,
carrying org + policy + correlation/causation context, with a reserved `approvedByUserId` for
future `REQUIRE_APPROVAL` commits) is **never** a user id.

## Consequences

**Positive**
- Explicit, first-class attribution for automation activity — no longer an anonymous null "system event" (AU-3 satisfied).
- Strictly additive and backward-compatible: defaults preserve every existing row; Timeline / notifications / `/activity` behavior is unchanged.
- No `User`-table pollution and no impersonation.
- Scalar link keeps the audit substrate free of a hard dependency cycle on the Automation domain.

**Negative / trade-offs**
- Touches an existing shared table (`ActivityLog`) — the **one** existing-table change in the phase. Mitigated: additive-only, defaulted, lands on `main` only (never on frozen `release/1.3`/`release/1.4`), and does not alter any frozen domain ownership boundary.
- Automation rows appear in the notifications feed as system events (existing null-actor inclusion); refining notification inclusion for automation is a deliberate later concern, not part of the spine.

## Alternatives considered

- **Create a per-org "system" `User` row:** rejected — it would carry login/role/`hashedPassword` semantics and **impersonate a user**, violating AU-3.
- **Keep `actorId: null` with no discriminator:** rejected — provides no identity; cannot satisfy "explicit ActivityLog attribution."
- **Self-audit only in `AutomationExecution`, never write `ActivityLog` (RefreshJob style):** rejected for the spine — the phase must prove **ActivityLog linkage without replacing it**; the discriminator is what makes an attributed, non-impersonating link possible.

## Traceability

AU-3 (Automation Principal, never a user) · Implementation Plan **Determination 10** ·
Schema Proposal §2 & §5.
