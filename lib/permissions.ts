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
  | "ORGANIZATION";

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
