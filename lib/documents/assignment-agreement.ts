// Assignment-agreement generation — the PURE core (v1.4 Slice 4, AS-E/AS-15). Owns the
// deterministic canonical snapshot + HTML renderer for a wholesale Assignment of Contract.
// NO Prisma, NO clock, NO randomness, NO locale/tz dependence — identical input ⇒ identical
// bytes (AS-15). It reads ONLY operational data (opportunity/property/parties/fee), NEVER
// underwriting outputs (AS-10/AS-14). It imports nothing from the underwriting or offer-memo
// modules — Assignments are independently versioned (AS-15). Design authority:
// docs/architecture/CLOSING_CENTER_ARCHITECTURE_LOCK.md (Slice 4 — Assignments, §15–17).

export const ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION = 1;
export const ASSIGNMENT_AGREEMENT_GENERATOR_VERSION = 1;
export const ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION = 1;

const DASH = "—";

/** The plain, already-resolved input the assembler consumes (all party names pre-resolved). */
export type AssignmentAgreementInput = {
  opportunity: { id: string; title: string; contractValueUsd: number | null; assignmentFeeUsd: number | null };
  property: {
    name: string;
    assetType: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    county: string | null;
  };
  assignor: { name: string | null; contact: string | null };
  assignee: { name: string | null; contact: string | null };
};

export type AssignmentAgreementMeta = {
  generatedAtIso: string;
  generatedById: string;
  generatedByDisplay: string;
};

export type AssignmentAgreementSnapshot = AssignmentAgreementInput & {
  meta: AssignmentAgreementMeta & {
    templateVersion: number;
    generatorVersion: number;
    snapshotSchemaVersion: number;
  };
};

/** Copy the input + stamp versions/meta into the canonical snapshot (no computation). */
export function assembleAssignmentAgreementSnapshot(
  input: AssignmentAgreementInput,
  meta: AssignmentAgreementMeta,
): AssignmentAgreementSnapshot {
  return {
    opportunity: { ...input.opportunity },
    property: { ...input.property },
    assignor: { ...input.assignor },
    assignee: { ...input.assignee },
    meta: {
      ...meta,
      templateVersion: ASSIGNMENT_AGREEMENT_TEMPLATE_VERSION,
      generatorVersion: ASSIGNMENT_AGREEMENT_GENERATOR_VERSION,
      snapshotSchemaVersion: ASSIGNMENT_AGREEMENT_SNAPSHOT_SCHEMA_VERSION,
    },
  };
}

// --- deterministic formatters (self-contained; no Intl, no locale, no tz) ----

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole-dollar USD, e.g. `$1,075,000`; DASH when absent. */
export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const neg = n < 0;
  const whole = Math.round(Math.abs(n));
  return `${neg ? "-$" : "$"}${groupThousands(String(whole))}`;
}

/** ISO timestamp in an explicit fixed UTC policy — never locale/tz-dependent. */
export function fmtDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function titleCaseWord(s: string): string {
  return s.toLowerCase().split("_").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/** A pre-escaped display string for an optional value, or DASH. */
function opt(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? escapeHtml(t) : DASH;
}

function fullAddress(p: AssignmentAgreementInput["property"]): string {
  const parts = [p.addressLine1, [p.city, p.state].filter(Boolean).join(", "), p.postalCode].filter(Boolean);
  return parts.length ? escapeHtml(parts.join(" · ")) : DASH;
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

// --- the pure HTML template --------------------------------------------------

/**
 * Render the deterministic self-contained HTML for a wholesale Assignment of Contract.
 * `value`s passed to row() are already-safe (formatted numbers or escaped strings).
 */
export function renderAssignmentAgreementHtml(s: AssignmentAgreementSnapshot): string {
  const assignor = opt(s.assignor.name);
  const assignee = opt(s.assignee.name);
  const property = escapeHtml(s.property.name);

  const partyRows = [
    row("Assignor", `${assignor}${s.assignor.contact ? ` <span class="muted">· ${escapeHtml(s.assignor.contact)}</span>` : ""}`),
    row("Assignee", `${assignee}${s.assignee.contact ? ` <span class="muted">· ${escapeHtml(s.assignee.contact)}</span>` : ""}`),
  ].join("");

  const dealRows = [
    row("Property", property),
    row("Asset type", escapeHtml(titleCaseWord(s.property.assetType))),
    row("Property address", fullAddress(s.property)),
    row("County", opt(s.property.county)),
    row("Underlying purchase-contract value", fmtUsd(s.opportunity.contractValueUsd)),
    row("Assignment fee", fmtUsd(s.opportunity.assignmentFeeUsd)),
    row("Opportunity reference", escapeHtml(s.opportunity.title)),
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Assignment of Contract — ${property}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1e293b; max-width: 800px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; }
  h1 { font-size: 1.5rem; text-align: center; letter-spacing: 0.02em; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  th[scope="row"] { width: 40%; color: #475569; font-weight: 600; }
  .muted { color: #94a3b8; font-weight: 400; }
  .clause { margin: 0.8rem 0; }
  .sig { display: flex; gap: 3rem; margin-top: 2.5rem; }
  .sig > div { flex: 1; border-top: 1px solid #334155; padding-top: 0.4rem; }
  footer { margin-top: 3rem; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 0.6rem; }
</style>
</head>
<body>
<h1>Assignment of Real Estate Purchase Contract</h1>

<h2>Parties</h2>
<table><tbody>${partyRows}</tbody></table>

<h2>Assigned Contract &amp; Property</h2>
<table><tbody>${dealRows}</tbody></table>

<h2>Assignment</h2>
<p class="clause">For good and valuable consideration, the Assignor hereby assigns, transfers, and conveys to the Assignee all of the Assignor's right, title, and interest in and to the real estate purchase contract for the property identified above, together with the right to purchase the property on the terms of that contract.</p>
<p class="clause">In consideration of this assignment, the Assignee shall pay the Assignor an assignment fee of <strong>${fmtUsd(s.opportunity.assignmentFeeUsd)}</strong>, due at or before closing of the underlying purchase contract.</p>
<p class="clause">The Assignor represents that the assigned contract is in full force and effect and has not been previously assigned. This assignment is subject to any consent required by the underlying contract.</p>

<h2>Signatures</h2>
<div class="sig">
  <div>Assignor: ${assignor}<br><span class="muted">Date: ____________________</span></div>
  <div>Assignee: ${assignee}<br><span class="muted">Date: ____________________</span></div>
</div>

<footer>
  Generated ${fmtDateUtc(s.meta.generatedAtIso)} by ${escapeHtml(s.meta.generatedByDisplay)} ·
  template v${s.meta.templateVersion} · generator v${s.meta.generatorVersion} · snapshot schema v${s.meta.snapshotSchemaVersion}.
  This is a draft prepared from operational deal data and is not legal advice.
</footer>
</body>
</html>`;
}
