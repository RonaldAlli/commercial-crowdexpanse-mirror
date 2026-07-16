import { OpportunityStage, UserRole } from "@prisma/client";

// Pure authorization policy — the single source of truth for role-based access.
// No Prisma, no framework: safe to import from server components (to hide
// controls) and from server actions (to enforce), and to unit-test directly.
//
// Slice 1 ENFORCES only the high-risk operations (delete, pipeline movement,
// team, invitations); the full matrix is encoded now so later slices only add
// call sites, not new policy.

export type Resource =
  | "SELLER"
  | "PROPERTY"
  | "OPPORTUNITY"
  | "DEAL_ANALYSIS"
  | "BUYER"
  | "BUYER_MATCH"
  | "TASK"
  | "NOTE"
  | "DOCUMENT"
  | "TEAM"
  | "INVITATION"
  | "ORGANIZATION"
  // Commercial Intelligence (v1.2). OWNER = the owner domain (read/write/link).
  // OWNER_IDENTITY = high-risk identity resolution (candidate accept/reject);
  // merge/unmerge is a distinct ADMIN-only check added in Commit 1a-2.
  | "OWNER"
  | "OWNER_IDENTITY"
  // PROPERTY_IDENTITY = high-risk canonical Property identity resolution + crosswalk
  // decisions (v1.2, Commit 2c). Distinct from ordinary PROPERTY write: recording an
  // anchor value is PROPERTY; resolving identity / editing the crosswalk is this.
  | "PROPERTY_IDENTITY"
  // Ingestion (v1.2, Commit 1c). REFRESH = triggering a source refresh / viewing
  // the refresh audit trail. Write = run a refresh; read = view job history.
  | "REFRESH"
  // Commercial Underwriting (v1.3, Commit 3a). UNDERWRITING = authoring scenarios /
  // assumptions and rebuilding results — the canonical successor to DEAL_ANALYSIS.
  | "UNDERWRITING"
  // UNDERWRITING_APPROVAL (v1.3, Commit 3d) = recording the DECIDED recommendation on a
  // LOCKED scenario. Deliberately SEPARATE from UNDERWRITING authoring (separation of
  // duties, AP-5): an analyst may author a scenario but not decide it.
  | "UNDERWRITING_APPROVAL"
  // Closing Center (v1.4, CC-D) = managing an opportunity's closing checklist / DD items.
  // Waiving a REQUIRED item is a stricter ADMIN-only check (canWaiveClosingItem), CC-5.
  | "CLOSING";

export type Action = "CREATE" | "READ" | "UPDATE" | "DELETE" | "MANAGE";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;
const ALL: UserRole[] = [ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS];

// Per resource: `write` roles hold full CRUD/MANAGE; `read` roles are read-only.
type Capability = { write: UserRole[]; read: UserRole[] };

const MATRIX: Record<Resource, Capability> = {
  SELLER: { write: [ADMIN, ACQUISITIONS], read: [ANALYST, DISPOSITIONS] },
  PROPERTY: { write: [ADMIN, ACQUISITIONS], read: [ANALYST, DISPOSITIONS] },
  OPPORTUNITY: { write: [ADMIN, ACQUISITIONS], read: [ANALYST, DISPOSITIONS] },
  DEAL_ANALYSIS: { write: [ADMIN, ANALYST], read: [ACQUISITIONS, DISPOSITIONS] },
  BUYER: { write: [ADMIN, DISPOSITIONS], read: [ACQUISITIONS, ANALYST] },
  BUYER_MATCH: { write: [ADMIN, DISPOSITIONS], read: [ACQUISITIONS, ANALYST] },
  TASK: { write: ALL, read: [] },
  NOTE: { write: ALL, read: [] },
  DOCUMENT: { write: ALL, read: [] },
  TEAM: { write: [ADMIN], read: [] },
  INVITATION: { write: [ADMIN], read: [] },
  ORGANIZATION: { write: [ADMIN], read: [] },
  // Owners are sourcing-side, like SELLER/PROPERTY: everyone reads, acquisitions write.
  OWNER: { write: [ADMIN, ACQUISITIONS], read: [ANALYST, DISPOSITIONS] },
  // Identity resolution is a high-risk MANAGE operation — no read-only tier.
  OWNER_IDENTITY: { write: [ADMIN, ACQUISITIONS], read: [] },
  // Property identity resolution/crosswalk decisions: ADMIN + ACQUISITIONS write AND
  // read the identity-review surface (candidate queue + resolution audit). ANALYST and
  // DISPOSITIONS get neither — identity review is governance, not operational reporting
  // (Commit 2c-ii). The read tier is stated explicitly (not merely implied by write).
  PROPERTY_IDENTITY: { write: [ADMIN, ACQUISITIONS], read: [ADMIN, ACQUISITIONS] },
  // Refresh mirrors OWNER: acquisitions run ingestion; everyone can read the trail.
  REFRESH: { write: [ADMIN, ACQUISITIONS], read: [ANALYST, DISPOSITIONS] },
  // Underwriting mirrors the legacy DEAL_ANALYSIS policy exactly: analysts author,
  // acquisitions/dispositions read.
  UNDERWRITING: { write: [ADMIN, ANALYST], read: [ACQUISITIONS, DISPOSITIONS] },
  // Deciding a recommendation is the higher-risk acquisition/disposition action:
  // ADMIN + ACQUISITIONS + DISPOSITIONS decide; ANALYST authors but only READS the
  // decision (separation of duties, AP-5). Read = all four (write ∪ [ANALYST]).
  UNDERWRITING_APPROVAL: { write: [ADMIN, ACQUISITIONS, DISPOSITIONS], read: [ANALYST] },
  // Closing work is owned by the acquisition/disposition/admin roles; analysts read.
  // Waiving a REQUIRED item is a distinct ADMIN-only check (canWaiveClosingItem, CC-5).
  CLOSING: { write: [ADMIN, ACQUISITIONS, DISPOSITIONS], read: [ANALYST] },
};

/** Can `role` perform `action` on `resource`? Pipeline movement is separate — see canMoveStage. */
export function can(role: UserRole, action: Action, resource: Resource): boolean {
  const cap = MATRIX[resource];
  if (action === "READ") return cap.write.includes(role) || cap.read.includes(role);
  // CREATE / UPDATE / DELETE / MANAGE all require write.
  return cap.write.includes(role);
}

// --- Pipeline movement --------------------------------------------------------
// Ownership of a workflow SEGMENT, judged by BOTH current and target stage — not
// the destination alone. This prevents e.g. Dispositions jumping LEAD → PAID.
export const STAGE_ORDER: OpportunityStage[] = Object.values(OpportunityStage);
const UC = STAGE_ORDER.indexOf(OpportunityStage.UNDER_CONTRACT);
const idx = (s: OpportunityStage) => STAGE_ORDER.indexOf(s);

/**
 * May `role` move an opportunity from `current` to `target`?
 * - ADMIN: any valid movement (the only role permitted to regress).
 * - ACQUISITIONS: current AND target both within LEAD…UNDER_CONTRACT, forward only.
 * - DISPOSITIONS: current at UNDER_CONTRACT or later, target within UNDER_CONTRACT…PAID, forward only.
 * - ANALYST: none.
 * UNDER_CONTRACT is the shared handoff. Backward moves are rejected for non-admins.
 */
// --- Owner identity: merge/unmerge -------------------------------------------
// Merging owners changes CANONICAL identity, so it is the strictest identity op:
// ADMIN only (a distinct check, like canMoveStage). Candidate accept/reject is
// the lower bar OWNER_IDENTITY MANAGE (ADMIN + ACQUISITIONS).
export function canMergeOwners(role: UserRole): boolean {
  return role === ADMIN;
}

// Reopening a DISMISSED candidate decision is an ADMIN-only identity action (a
// distinct check, like canMergeOwners). Confirm/dismiss are the lower bar
// OWNER_IDENTITY MANAGE (ADMIN + ACQUISITIONS); explicit reopen is ADMIN only.
export function canReopenMatchDecision(role: UserRole): boolean {
  return role === ADMIN;
}

// Waiving a REQUIRED closing checklist item overrides a gate to PAID, so it is the
// strictest closing action: ADMIN only (a distinct check, like canMergeOwners) — CC-5.
// Ordinary item work (complete / N-A / reopen / owner / due date) is CLOSING write.
export function canWaiveClosingItem(role: UserRole): boolean {
  return role === ADMIN;
}

// Resolving escrow to a TERMINAL money outcome (released / refunded / forfeited) moves real
// funds and writes an immutable historical fact, so it is the strictest escrow action:
// ADMIN only (a distinct check, like canWaiveClosingItem) — EC-G/EC-4. Ordinary escrow work
// (open / set amount+dates+holder / mark deposited / link proof) is CLOSING write.
export function canResolveEscrow(role: UserRole): boolean {
  return role === ADMIN;
}

// Resolving financing to a TERMINAL outcome (funded / denied / withdrawn) captures the FC-J
// snapshot and freezes the record, so it is the strictest financing action: ADMIN only
// (a distinct check, like canResolveEscrow) — FC-G/FC-6. Ordinary financing work (apply /
// advance / set lender+milestone dates / link documents) is CLOSING write.
export function canResolveFinancing(role: UserRole): boolean {
  return role === ADMIN;
}

export function canMoveStage(role: UserRole, current: OpportunityStage, target: OpportunityStage): boolean {
  const c = idx(current);
  const t = idx(target);
  if (c < 0 || t < 0) return false; // unknown stage
  if (role === ADMIN) return true;
  if (role === ANALYST) return false;
  if (t < c) return false; // no backward movement for workflow-owning roles
  if (role === ACQUISITIONS) return c <= UC && t <= UC;
  if (role === DISPOSITIONS) return c >= UC && t >= UC;
  return false;
}
