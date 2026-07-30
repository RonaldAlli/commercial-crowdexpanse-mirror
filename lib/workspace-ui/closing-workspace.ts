// CRE Operating Workspace — Closing Workspace, Increment 1: Executive Closing Summary.
//
// PURE PRESENTATION LOGIC ONLY — deterministic, no data access, no clock/random, no calculation. Answers the
// operator's first closing question — "Can this transaction close?" — ANSWER FIRST, then domain readiness and
// blockers. It composes ALREADY-PERSISTED authority (the checklist readiness summary from lib/closing.ts and
// the per-domain terminal-status predicates from lib/{escrow,financing,assignment}.ts) into a presentation.
//
// BOUNDARIES: read-only. No checklist/status/owner/escrow/financing/assignment writes, no milestone creation,
// no console duplication, and NO readiness RECALCULATION — the checklist gate is the existing
// closingReadinessSummary (passed in), and domain state is the existing terminal predicates (passed in).
//
// INFORMATION QUALITY (R4 + the readiness-explanation refinement): the checklist gate ("checklist complete")
// is NEVER presented as "closeable" on its own. When the checklist is complete but an operational domain is
// still in progress, the verdict says so explicitly and does not imply the deal is ready to close.
//
// DOMAIN PROGRESSION (accepted planning constraint): Checklist / Escrow / Financing / Assignment are four
// visually distinct domains, each communicating only its own status — never collapsed into one blocked list.

export type DomainState = "resolved" | "in-progress" | "not-started";
export type CloseableVerdict = "yes" | "not-yet" | "checklist-complete-domains-outstanding" | "not-established";

/** A per-domain input already reduced from persisted records via existing helpers (label + terminal). */
export type DomainInput = {
  key: "escrow" | "financing" | "assignment";
  present: boolean; // a record exists
  started: boolean; // status is not the initial NOT_STARTED / NOT_OPENED
  terminal: boolean; // via the existing isTerminal<Domain>Status predicate
  statusLabel: string; // via the existing <domain>StatusLabel helper
};

export type ClosingReadiness = {
  ready: boolean;
  requiredTotal: number;
  requiredSatisfied: number;
  outstandingCount: number;
  blockMessage: string | null;
};

export type ClosingWorkspaceInput = {
  hasChecklist: boolean;
  readiness: ClosingReadiness | null; // null when no checklist exists (readiness not yet established)
  blockerLabels: string[]; // outstanding checklist item labels, in PERSISTED order (not reprioritized)
  domains: DomainInput[]; // escrow, financing, assignment
};

export type VerdictView = { kind: CloseableVerdict; label: string; srLabel: string; toneClass: string; explanation: string | null };
export type DomainView = { key: string; title: string; statusLabel: string; state: DomainState; stateLabel: string };
export type ClosingWorkspaceView = {
  verdict: VerdictView;
  readiness: ClosingReadiness | null;
  domains: DomainView[]; // Checklist, Escrow, Financing, Assignment — always four, in this order
  blockers: string[]; // outstanding checklist items (persisted order) then in-progress domains — existing only
};

const DOMAIN_TITLE: Record<string, string> = { checklist: "Checklist", escrow: "Escrow", financing: "Financing", assignment: "Assignment" };
const STATE_LABEL: Record<DomainState, string> = { resolved: "Resolved", "in-progress": "In progress", "not-started": "Not started" };

function domainStateOf(d: DomainInput): DomainState {
  if (!d.present || !d.started) return "not-started";
  return d.terminal ? "resolved" : "in-progress";
}

const VERDICTS: Record<CloseableVerdict, { label: string; sr: string; tone: string }> = {
  yes: { label: "Yes — clear to close", sr: "Yes: the checklist is complete and no operational domain is outstanding.", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  "not-yet": { label: "Not yet", sr: "Not yet: the closing checklist has outstanding required items.", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  "checklist-complete-domains-outstanding": { label: "Not yet — checklist complete, operational requirements outstanding", sr: "Not yet ready to close: the checklist is complete, but one or more operational closing domains are still outstanding.", tone: "bg-amber-50 text-amber-800 ring-amber-200" },
  "not-established": { label: "Not established", sr: "Closing readiness has not yet been established for this opportunity.", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** Deterministic, read-only Executive Closing Summary view. Composes existing authority; never recalculates. */
export function buildClosingWorkspaceView(input: ClosingWorkspaceInput): ClosingWorkspaceView {
  const domainViews: DomainView[] = input.domains.map((d) => {
    const state = domainStateOf(d);
    return { key: d.key, title: DOMAIN_TITLE[d.key], statusLabel: d.statusLabel, state, stateLabel: STATE_LABEL[state] };
  });
  const inProgressDomains = domainViews.filter((d) => d.state === "in-progress");

  // Checklist domain (first, distinct) — derived only from the existing readiness summary.
  const checklistState: DomainState = !input.hasChecklist || !input.readiness
    ? "not-started"
    : input.readiness.ready
      ? "resolved"
      : "in-progress";
  const checklistDomain: DomainView = {
    key: "checklist",
    title: DOMAIN_TITLE.checklist,
    statusLabel: !input.hasChecklist || !input.readiness
      ? "Not started"
      : input.readiness.ready
        ? `Complete (${input.readiness.requiredSatisfied}/${input.readiness.requiredTotal})`
        : `${input.readiness.outstandingCount} outstanding (${input.readiness.requiredSatisfied}/${input.readiness.requiredTotal})`,
    state: checklistState,
    stateLabel: STATE_LABEL[checklistState],
  };

  // Verdict — answer first, honest (R4): checklist-complete is never presented as closeable on its own.
  let kind: CloseableVerdict;
  let explanation: string | null = null;
  if (!input.hasChecklist || !input.readiness) {
    kind = "not-established";
    explanation = "No closing checklist has been started for this opportunity.";
  } else if (!input.readiness.ready) {
    kind = "not-yet";
    explanation = input.readiness.blockMessage;
  } else if (inProgressDomains.length > 0) {
    kind = "checklist-complete-domains-outstanding";
    explanation = `Checklist complete — operational closing requirements still outstanding (${inProgressDomains.map((d) => d.title).join(", ")}).`;
  } else {
    kind = "yes";
    explanation = "Checklist complete and no operational domain is outstanding.";
  }
  const v = VERDICTS[kind];

  // Blockers — existing only, no reprioritization: outstanding checklist items first (persisted order),
  // then any in-progress operational domain.
  const blockers = [
    ...input.blockerLabels,
    ...inProgressDomains.map((d) => `${d.title}: ${d.statusLabel}`),
  ];

  return {
    verdict: { kind, label: v.label, srLabel: v.sr, toneClass: v.tone, explanation },
    readiness: input.readiness,
    domains: [checklistDomain, ...domainViews],
    blockers,
  };
}
