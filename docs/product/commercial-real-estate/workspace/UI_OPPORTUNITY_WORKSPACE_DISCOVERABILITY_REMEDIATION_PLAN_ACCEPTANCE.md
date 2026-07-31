# Opportunity Workspace Discoverability Remediation — Planning Acceptance Record

> **Status: PLANNING ACCEPTED WITH OBSERVATIONS** (founder-accepted 2026-07-31, PR #82). Accepts
> `UI_OPPORTUNITY_WORKSPACE_DISCOVERABILITY_REMEDIATION_PLAN.md` (audit baseline `main adad471`).
> **Implementation NOT authorized** — awaits a separate APPROVED TO IMPLEMENT. Context:
> [[crowdexpanse-cre-workspace]], [[crowdexpanse-accepted-to-released-discipline]].

## Governing rule (accepted)

Opportunity Workspace = the **primary operator detail surface**; Closing Console = the **authoritative execution
surface reached from the workspace**. Ordinary deal-opening must not bypass the workspace layer; direct console
access is preserved wherever execution is the intent.

## Founder rulings (folded into the plan)

- **§4a core repoints (7): APPROVED** — Pipeline board + table, Dashboard "Recent opportunities", Global search,
  Tasks list, Task detail, Related-record note links → Opportunity Workspace ("understand this deal" entries).
- **C1 Buyer matches → REPOINT** (analysis surface, not execution).
- **C2 Analyzer "Opportunity" back-link (×2) → REPOINT** (completes Workspace → Guided Underwriting → Analyzer →
  Workspace loop; analyzer is understanding, not execution).
- **C3 Closing/transaction dashboard rows → KEEP CONSOLE** (the `/closing` dashboard is an execution surface;
  operators there are working closings — preserve intent). *This is the one surface deliberately left on the
  console.*
- **C4 Post-create redirect → REPOINT to Opportunity Workspace** (a new deal begins its lifecycle on the Workspace).
- **§5 Workspace → "Open Closing Console" affordance: APPROVED, in scope** — one-hop execution access; console page
  itself untouched. The Workspace then offers three complementary intentional exits: Guided Underwriting (structure),
  Closing Workspace (readiness), Open Closing Console (execute).
- **Navigation restructuring: confirmed NOT triggered** — nav IA / routes / authority unchanged; this is a
  discoverability correction to the default deal-opening destination, not restructuring.

## New platform contract carried forward

**Operator Entry Principle — every core business object has exactly one primary landing page; specialized
workspaces are entered intentionally from that landing page rather than becoming competing default destinations.**
Joins the platform-wide workspace contracts (Executive Summary · Information Quality · Decision Chronology ·
Workspace Progression · Workspace Discoverability). Governs future objects (Seller, Property, Buyer, …) too.

## Stop-condition check (accepted)

None triggered: no schema, API, workflow-authority, Closing Console modification, broad navigation restructuring,
or data migration. Scope = bounded `href` repointing (9 repoints across 8 surfaces; C3 stays console) + the
approved Workspace→Console affordance + a re-run click-path Discoverability Verification + the release-record
discoverability correction.

## Next governed phase

**APPROVED TO IMPLEMENT is a separate decision.** On authorization, implementation proceeds as governed increments
(Plan §7): Increment 1 (core repoints) → Increment 2 (C1/C2/C4) → Increment 3 (Workspace→Console affordance),
each reviewed and accepted, then the full Accepted → Released lifecycle — including a Discoverability Verification
that exercises the real click-path (Pipeline → Workspace → Guided Underwriting / Closing Workspace / Closing
Console) and lands the release-record correction (discoverability was only partially verified; workspace-to-workspace
proven; dominant Pipeline discoverability not proven; this remediation closes the gap).
