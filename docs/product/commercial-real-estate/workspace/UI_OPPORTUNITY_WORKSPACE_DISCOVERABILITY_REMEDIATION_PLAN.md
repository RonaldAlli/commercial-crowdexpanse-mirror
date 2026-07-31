# CRE Operating Workspace — Opportunity Workspace Discoverability Remediation — PLAN

> **Status: PLAN — AWAITING REVIEW. No implementation, no merge, no deployment.** Governed decision:
> *Discoverability Remediation (Pipeline → Opportunity Workspace) — APPROVED TO PLAN.* Audit baseline: current
> `main adad471`. Context: `CRE_CLOSING_WORKSPACE_PRODUCTION_RELEASE.md`, `crowdexpanse-cre-workspace`,
> [[crowdexpanse-accepted-to-released-discipline]].

## 1. Problem (established, live-verified)

The workspace layer is deployed and renders correctly, but the **only** entry point into the Opportunity
Workspace is the Command Center. Every other natural deal-opening path routes to the legacy **Closing Console**
(`/opportunities/[id]`), which contains **none** of the workspace crosslinks. Live production evidence:

- Pipeline list (`/opportunities`) — **0** links to `/opportunity-workspace/`, **59** to `/opportunities/[id]`.
- Console page (`/opportunities/[id]`) — **0** occurrences of closing-workspace / guided-underwriting / workspace.
- Command Center (`/command-center`) — the sole surface linking to `/opportunity-workspace/[id]`.

An operator opening a deal the obvious way (Pipeline → click) never reaches Guided Underwriting or the Closing
Workspace.

## 2. Governing rule (from the decision)

**Opportunity Workspace is the primary operator detail surface. Closing Console is the authoritative execution
surface, reached *from* the workspace.** Ordinary deal-opening must not bypass the workspace layer; direct console
access must be preserved wherever *execution* is the intent.

## 3. Target operator path

Pipeline → `/opportunity-workspace/[id]` → Guided Underwriting → Closing Workspace → Closing Console.

## 4. Surface audit & classification (every opportunity-detail link on `main adad471`)

Legend: **REPOINT** → change to `/opportunity-workspace/[id]`; **KEEP CONSOLE** → stays `/opportunities/[id]`
(execution intent); **CONDITIONAL** → repoint recommended but changes a behavior worth an explicit decision;
**OUT OF SCOPE** → not operator navigation (server-action cache/redirect plumbing, or console-internal).

### 4a. REPOINT — ordinary deal-opening navigation (the remediation core)

| # | Surface | File:line | Rationale |
|---|---------|-----------|-----------|
| 1 | **Pipeline list — board view** | `app/(workspace)/opportunities/page.tsx:305` | The dominant path. Deal-opening. |
| 2 | **Pipeline list — table view** | `app/(workspace)/opportunities/page.tsx:370` | Same, list layout. |
| 3 | **Dashboard "Recent opportunities"** | `app/(workspace)/dashboard/page.tsx:174` | Deal-opening from the overview. |
| 4 | **Global search results** | `lib/search.ts:115` | Deal-opening from search. |
| 5 | **Tasks list → its opportunity** | `app/(workspace)/tasks/page.tsx:148` | Opening the deal a task belongs to. |
| 6 | **Task detail → its opportunity** | `app/(workspace)/tasks/[id]/page.tsx:39` | Same. |
| 7 | **Related-record note links** | `lib/note-links.ts:24` | "Any related-record links" per the decision. |

### 4b. CONDITIONAL — repoint recommended, but each changes a behavior; decide explicitly

| # | Surface | File:line | The decision to make |
|---|---------|-----------|----------------------|
| C1 | **Buyer matches → opportunity** | `app/(workspace)/matches/page.tsx:103` | Matching is an operator context, not execution → recommend REPOINT. |
| C2 | **Analyzer "Opportunity" back-link** (×2) | `app/(workspace)/analyzer/[opportunityId]/page.tsx:134,222` | Analyzer is reached *from* the workspace; a "back to deal" affordance → recommend REPOINT (returns to primary detail). |
| C3 | **Closing/transaction dashboard rows** | `lib/transaction-dashboard.ts:160` | `/closing` is execution-leaning. Repoint sends operators to the workspace's Closing Summary (which links onward to the console); or KEEP CONSOLE if this surface is meant as a direct execution list. **Recommend REPOINT** (consistent with the rule), flagged for your call. |
| C4 | **Post-CREATE redirect** | `app/(workspace)/opportunities/actions.ts:143` | After creating a deal, land on the workspace (primary detail, mostly-empty early state) vs the console. **Recommend REPOINT.** |

### 4c. KEEP CONSOLE — explicit execution intent (must NOT change)

| # | Surface | File:line | Why it stays |
|---|---------|-----------|--------------|
| K1 | Closing badges deep-link | `components/closing-badges.tsx:25` | `#closing-center` anchor — explicit execution. |
| K2 | Timeline "View in Closing Center" | `lib/transaction-timeline.ts:112` | Explicit execution deep-link. |
| K3 | Timeline "View document" | `lib/transaction-timeline.ts:116` | Execution/document context. |
| K4 | Closing Workspace → "Open Closing Console" (×2) | `components/workspace-ui/closing/ClosingWorkspace.tsx:28,186` | The intended workspace→console execution handoff. Correct by design. |

### 4d. OUT OF SCOPE — not operator navigation

- **Server-action `revalidatePath` / post-mutation `redirect`** targeting `/opportunities/[id]`:
  `matches/actions.ts:131,201,232`; `opportunities/diligence-actions.ts:50,103,111,112`;
  `opportunities/actions.ts:223,224,295,312,317`; `assignment-actions.ts:28`; `escrow-actions.ts:29`;
  `closing-actions.ts:29`; `financing-actions.ts:33`. These mutations originate *on the console* and refresh it;
  they are execution plumbing, not deal-opening. **Note:** the workspace routes are `export const dynamic =
  "force-dynamic"`, so they hold no cache to revalidate — no workspace-side revalidation is needed.
  (`actions.ts:143` post-create redirect is the one exception → treated as **C4**.)
- **Console-internal links**: `opportunities/[id]/edit/page.tsx:66` (cancel), `opportunities/[id]/page.tsx:505`
  (edit button), `:845` (redirectTo hidden field), `:1050` (timeline basePath). Internal to the execution surface.
- **Already correct**: `lib/workspace-ui/command-center.ts:29,62` → already `/opportunity-workspace/[id]`.

## 5. Open design question (must be answered before implementation)

The Opportunity Workspace currently has **no direct link to the Closing Console**
(`app/(workspace)/opportunity-workspace/[id]/page.tsx:74–81` cross-links: Guided underwriting, Seller, Property,
Buyer matches, Agreements, Documents, Closing workspace — but **not** the console). Reaching execution is a 2-hop
path: Workspace → Closing Workspace → "Open Closing Console". If the workspace becomes the primary landing, an
operator who needs the execution surface pays two hops.

**Proposed (in-scope, does NOT modify the console):** add a direct "Open in Closing Console" cross-link on the
Opportunity Workspace (a link *to* `/opportunities/[id]`, added in the workspace component — the console page
itself is untouched). This preserves one-hop execution access. **Flagged for your decision**: include this in the
remediation, or keep the 2-hop path.

## 6. Stop-condition check (per the decision)

| Stop condition | Triggered? | Reasoning |
|---|---|---|
| Schema changes | **No** | Pure link-target (`href`) changes. |
| API changes | **No** | No route handlers touched. |
| Workflow authority changes | **No** | No stage/gate/action logic touched. |
| **Closing Console modification** | **No** | `/opportunities/[id]/page.tsx` is not edited. We change links that *point at* it, and (optionally, §5) add a link *to* it from the workspace. |
| **Broad navigation restructuring** | **No** (see note) | The global nav IA (`components/workspace-shell.tsx`) is unchanged — same entries, same sections. We only repoint deal-row link *targets*. **Interpretation flagged for confirmation:** if you consider repointing the primary Pipeline link "navigation restructuring," this trips the stop condition — please confirm you read it as targeted repointing, not restructuring. |
| Data migration | **No** | No data changes. |

**Conclusion:** no stop condition is triggered under the stated interpretation. The remediation is bounded `href`
repointing at operator-navigation surfaces (7 REPOINT + up to 4 CONDITIONAL), plus one optional in-scope workspace
affordance (§5). Console, nav IA, schema, API, and workflow authority are all untouched.

## 7. Proposed implementation shape (for the NEXT decision, not now)

- **Increment 1 — Core deal-opening repoint:** surfaces 1–7 (§4a). This alone fixes the dominant Pipeline path.
- **Increment 2 — Conditional surfaces:** C1–C4 (§4b), per your classification.
- **Increment 3 (optional) — Workspace→Console affordance:** §5, if approved.
- **Verification:** unit (unchanged view-models), full Playwright (add/adjust specs asserting each repointed
  surface lands on `/opportunity-workspace/[id]`; console-intent links still land on the console), then the full
  Accepted → Released lifecycle with a **re-run Discoverability Verification** exercising the real click-path
  (Pipeline → workspace → GU/Closing → console), not just direct-URL navigation.

## 8. Release-record correction (to be landed with the remediation)

The prior release records overstated discoverability. The correction to record:

- Discoverability was only **partially** verified.
- **Workspace-to-workspace continuity was proven** (Opportunity Workspace → Guided Underwriting / Closing
  Workspace links exist and render).
- **Dominant Pipeline discoverability was *not* proven** — the Opportunity Workspace was reached only by direct
  URL with a minted session; the primary Pipeline / search / closing-dashboard click-paths route to the console.
- **This remediation closes that gap** and its verification must exercise the click-path, not direct URLs.

(Applies to `CRE_CLOSING_WORKSPACE_PRODUCTION_RELEASE.md` and, by reference, the M1/M2 discoverability claims.)

## 9. What this plan does NOT do

No code changed. No PR merged. No deployment. Classifications in §4b (C1–C4) and the §5 affordance are proposals
awaiting your ruling. On approval, implementation proceeds as governed increments (§7), each reviewed and accepted
before the Accepted → Released lifecycle.
