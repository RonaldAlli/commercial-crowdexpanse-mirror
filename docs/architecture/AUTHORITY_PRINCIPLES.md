# Authority Principles (platform-wide)

> Cross-cutting security guidance for **every** authenticated, multi-tenant endpoint — not scoped to any one
> subsystem. Established 2026-07-23 from the pipeline tenant-isolation fix. These principles sit alongside the
> engineering discipline in `OPPORTUNITY_PIPELINE_ENGINEERING_CONSTITUTION.md` and apply beyond it.

---

## Authority Rule 1 — Session-authoritative tenant scope

> **No authenticated API endpoint may derive tenant scope from client-controlled input when that scope can be
> authoritatively derived from the authenticated session.**

### Why

Tenant scope is an **authority** decision, not a **routing** input. When an endpoint reads `organizationId` (or any
tenant selector) from the request — query string, body, header, path — it has moved the trust boundary to the caller.
An authenticated user can then name a tenant that is not theirs. That is a cross-tenant IDOR regardless of how
"dormant," "unlinked," or "not in navigation" the surface is — obscurity is not an authorization control.

### The correct authority chain

```
Authenticated session (signed cookie)
        ↓  requireUser()
User (live record, ACTIVE, session epoch valid)
        ↓
Organization  (user.organizationId — the ONLY source of tenant scope)
        ↓
Resource ownership  (resource.organizationId === user.organizationId ?)
        ↓
Handler proceeds  —  else 404 / notFound (non-disclosure)
```

### How to apply (checklist for any multi-tenant endpoint)

1. **Derive** the organization from `requireUser()` — never from request input.
2. **Remove** the client-supplied tenant selector from the authority path entirely. Do **not** merely check that the
   caller-provided value equals the session value and then keep passing the external value deeper — delete it from the
   authority path so it cannot be threaded through by mistake later.
3. **Verify ownership**: the target resource must belong to the caller's organization.
4. **Non-disclosure**: a cross-tenant or unknown resource returns **404 / `notFound()`**, never 403-with-detail or an
   empty-but-200 — so tenant existence is not leaked.
5. **One resolver per surface**: centralize the derivation (one function), so the rule can't drift across sibling
   handlers (GET/POST/page).

### Reference implementation

`lib/pipeline-tenant.ts` (`resolveOwnedPipelineScope`) — the shared resolver behind all three pipeline adapters,
added in main `a1d36d5` (tag `security-pipeline-tenant-scope`). Acceptance: `tests/unit/pipeline-tenant/*` +
`scripts/e2e-pipeline-tenant-scope.mjs` (AC-PIPE-AUTHZ-1..6).

### Scope of the rule

Applies to **every** multi-tenant surface — pipeline, opportunities, buyers, sellers, agreements, communications, and
every future endpoint. The established workspace server actions already follow it (they scope Prisma queries by
`user.organizationId` from `requireUser()`); the pipeline's thin E7 adapters were the outlier and are now corrected.

### A distinct concern this rule does NOT cover

**Who** is acting (actor identity/capability) is a *separate* authorization axis from **which tenant** they may access.
An endpoint that derives tenant from the session can still be wrong if it trusts a client-asserted *actor*
(e.g. `body.actor`/`body.capability`). That is its own hardening item — see the pipeline `fact-operations` POST,
tracked for activation in `Slice2_Architecture_Baseline_v1.0.md` §7. Do not conflate the two.
