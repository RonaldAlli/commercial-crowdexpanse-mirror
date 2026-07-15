// Offer-memo generation — the PURE core (v1.3, offer-memo generation). Owns the
// canonical source snapshot shape, the pure snapshot assembler, and the pure,
// deterministic HTML renderer. Design authority:
// docs/architecture/OFFER_MEMO_ARCHITECTURE_LOCK.md (OM-1…OM-12).
//
// This module has NO Prisma, NO underwriting, NO clock, NO randomness, NO I/O — it
// is a pure function of its inputs, so an offer memo is byte-for-byte reproducible
// from its stored snapshot (OM-4/OM-6). The service converts persisted rows into a
// plain `ScenarioMemoInput`, then calls `assembleOfferMemoSnapshot` → the immutable
// `OfferMemoSnapshot` (persisted verbatim), then `renderOfferMemoHtml` → the stored
// bytes. Determinism (OM-F): canonical key ordering, hand-rolled locale-independent
// formatting, an explicit UTC date policy, full HTML escaping, and a self-contained
// document with no external scripts/styles/fonts/images/network references.

// Version stamps recorded on every generated memo (OM-5). Bump the template or
// generator version whenever the rendered output could change; bump the snapshot
// schema version whenever the snapshot shape changes.
export const OFFER_MEMO_TEMPLATE_VERSION = 1;
export const OFFER_MEMO_GENERATOR_VERSION = 1;
export const OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION = 1;

/** A key/value display pair (an assumption). Value is a plain number (no Decimal). */
export type MemoAssumption = { key: string; value: number };

/**
 * The plain, serializable bundle the service extracts from the persisted, settled
 * underwriting rows. No Prisma types and no Decimals — the service converts at its
 * boundary. This is the upstream contract of the pure assembler; the pure module
 * never touches the database (OM-3/OM-10).
 */
export type ScenarioMemoInput = {
  opportunity: { id: string; title: string };
  property: {
    name: string;
    assetType: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string | null;
    county: string | null;
    unitCount: number | null;
  };
  scenario: {
    id: string;
    label: string;
    version: number;
    status: string;
    scenarioVersion: string;
    modelVersion: number;
    calcLibVersion: number;
    rulesetVersion: number;
    analystSummary: string | null;
  };
  operatingAssumptions: MemoAssumption[];
  result: {
    grossIncomeAnnualUsd: number | null;
    operatingExpensesUsd: number | null;
    noiAnnualUsd: number | null;
    allInCostUsd: number;
    capRate: number | null;
    pricePerUnitUsd: number | null;
    expenseRatioPct: number | null;
    spreadUsd: number | null;
  };
  primaryCase: {
    id: string;
    label: string;
    position: number;
    capitalAssumptions: MemoAssumption[];
    result: {
      annualDebtServiceUsd: number | null;
      dscr: number | null;
      debtYieldPct: number | null;
      sizedLoanUsd: number | null;
      bindingConstraint: string | null;
      avgDscr: number | null;
      cumulativeCashFlowUsd: number | null;
      terminalNoiUsd: number | null;
      exitCapRatePct: number | null;
      grossExitValueUsd: number | null;
      netSaleProceedsUsd: number | null;
      debtPayoffUsd: number | null;
      contributedEquityUsd: number | null;
      equityMultiple: number | null;
      leveredIrrPct: number | null;
      totalProfitUsd: number | null;
    };
  };
  findings: {
    code: string;
    category: string;
    severity: string;
    title: string;
    detail: string;
    observedValue: number | null;
    thresholdValue: number | null;
  }[];
  /** The engine's advisory suggestion (RecommendationLevel) — distinct from a decision. */
  suggestedRecommendation: string | null;
  /** The current human decision, or null when none was recorded (OM-J). */
  decision: {
    id: string;
    sequence: number;
    level: string;
    rationale: string;
    actorDisplay: string;
    decidedAtIso: string;
  } | null;
};

/** Generation context the service supplies (the ONLY clock read happens here). */
export type OfferMemoMeta = {
  generatedAtIso: string;
  generatedById: string;
  generatedByDisplay: string;
};

/**
 * The immutable canonical snapshot persisted on the Document and consumed by the
 * renderer (OM-4). It contains exactly the values the renderer uses — nothing more.
 */
export type OfferMemoSnapshot = {
  snapshotSchemaVersion: number;
  templateVersion: number;
  generatorVersion: number;
  generatedAt: string;
  generatedBy: { id: string; display: string };
  opportunity: ScenarioMemoInput["opportunity"];
  property: ScenarioMemoInput["property"];
  scenario: ScenarioMemoInput["scenario"];
  operatingAssumptions: MemoAssumption[];
  result: ScenarioMemoInput["result"];
  primaryCase: ScenarioMemoInput["primaryCase"];
  findings: ScenarioMemoInput["findings"];
  // OM-J: the engine suggestion and the human decision are ALWAYS distinct fields.
  engineSuggestion: string | null;
  humanDecision: ScenarioMemoInput["decision"];
};

/** Canonical key ordering for assumptions (OM-F) — deterministic, locale-independent. */
function byKey(a: MemoAssumption, b: MemoAssumption): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Pure: settle the plain input + generation meta into the canonical snapshot. The
 * only transformation is deterministic ordering; raw numeric values are preserved
 * verbatim (formatting is the renderer's job), so the snapshot is exact audit evidence.
 */
export function assembleOfferMemoSnapshot(input: ScenarioMemoInput, meta: OfferMemoMeta): OfferMemoSnapshot {
  return {
    snapshotSchemaVersion: OFFER_MEMO_SNAPSHOT_SCHEMA_VERSION,
    templateVersion: OFFER_MEMO_TEMPLATE_VERSION,
    generatorVersion: OFFER_MEMO_GENERATOR_VERSION,
    generatedAt: meta.generatedAtIso,
    generatedBy: { id: meta.generatedById, display: meta.generatedByDisplay },
    opportunity: input.opportunity,
    property: input.property,
    scenario: input.scenario,
    operatingAssumptions: [...input.operatingAssumptions].sort(byKey),
    result: input.result,
    primaryCase: { ...input.primaryCase, capitalAssumptions: [...input.primaryCase.capitalAssumptions].sort(byKey) },
    findings: input.findings,
    engineSuggestion: input.suggestedRecommendation,
    humanDecision: input.decision,
  };
}

// --- deterministic, locale-independent formatting ----------------------------

const DASH = "—";

/** Escape every data-derived string before it enters the HTML (OM-12 / injection safety). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Group an integer string's digits in threes with commas — no Intl, no locale. */
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Whole-dollar USD, e.g. `$1,075,000` / `-$1,200`. */
export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const neg = n < 0;
  const whole = Math.round(Math.abs(n));
  return `${neg ? "-$" : "$"}${groupThousands(String(whole))}`;
}

/** Percent to at most 2 decimals, e.g. `8%` / `6.25%`. */
export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return `${round2(n)}%`;
}

/** Equity multiple, e.g. `2.15×`. */
export function fmtMult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return `${round2(n)}×`;
}

/** Grouped integer, e.g. `10` / `1,250`. */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  return groupThousands(String(Math.round(n)));
}

/** Format the ISO timestamp in an explicit, fixed UTC policy (OM-F) — never locale/tz-dependent. */
export function fmtDateUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const REC_LABEL: Record<string, string> = {
  PROCEED: "Proceed",
  PROCEED_WITH_CONDITIONS: "Proceed with conditions",
  PASS: "Pass",
};
const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  DECLINED: "Declined",
  DEFERRED: "Deferred",
};

// --- the pure HTML template --------------------------------------------------

/** One label/value row. `value` is treated as ALREADY-SAFE (a formatted number or an escaped string). */
function row(label: string, value: string): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function titleCaseWord(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Pure: render the canonical snapshot to a complete, self-contained HTML document.
 * Deterministic for a given snapshot (OM-F): no clock, no randomness, no external
 * references. Every data-derived string is escaped; every number goes through the
 * locale-independent formatters above.
 */
export function renderOfferMemoHtml(s: OfferMemoSnapshot): string {
  const p = s.property;
  const addr = [p.addressLine1, p.city, `${p.state}${p.postalCode ? ` ${p.postalCode}` : ""}`]
    .filter(Boolean)
    .map((x) => escapeHtml(x))
    .join(", ");

  const r = s.result;
  const c = s.primaryCase;
  const cr = c.result;

  const operatingRows = [
    row("Net operating income (annual)", fmtUsd(r.noiAnnualUsd)),
    row("Cap rate", fmtPct(r.capRate)),
    row("All-in cost", fmtUsd(r.allInCostUsd)),
    row("Spread over cost", fmtUsd(r.spreadUsd)),
    row("Price per unit", fmtUsd(r.pricePerUnitUsd)),
    row("Expense ratio", fmtPct(r.expenseRatioPct)),
    row("Gross income (annual)", fmtUsd(r.grossIncomeAnnualUsd)),
    row("Operating expenses (annual)", fmtUsd(r.operatingExpensesUsd)),
  ].join("");

  const financingRows = [
    row("Sized loan", fmtUsd(cr.sizedLoanUsd)),
    row("Binding constraint", cr.bindingConstraint ? escapeHtml(titleCaseWord(cr.bindingConstraint)) : DASH),
    row("Annual debt service", fmtUsd(cr.annualDebtServiceUsd)),
    row("DSCR (year 1)", fmtMult(cr.dscr)),
    row("Average DSCR", fmtMult(cr.avgDscr)),
    row("Debt yield", fmtPct(cr.debtYieldPct)),
    row("Cumulative cash flow", fmtUsd(cr.cumulativeCashFlowUsd)),
  ].join("");

  const returnsRows = [
    row("Equity multiple", fmtMult(cr.equityMultiple)),
    row("Levered IRR", fmtPct(cr.leveredIrrPct)),
    row("Total profit", fmtUsd(cr.totalProfitUsd)),
    row("Contributed equity", fmtUsd(cr.contributedEquityUsd)),
    row("Terminal NOI", fmtUsd(cr.terminalNoiUsd)),
    row("Exit cap rate", fmtPct(cr.exitCapRatePct)),
    row("Gross exit value", fmtUsd(cr.grossExitValueUsd)),
    row("Debt payoff at exit", fmtUsd(cr.debtPayoffUsd)),
    row("Net sale proceeds", fmtUsd(cr.netSaleProceedsUsd)),
  ].join("");

  const assumptionRows = (list: MemoAssumption[]): string =>
    list.length
      ? list.map((a) => row(titleCaseWord(a.key), fmtAssumption(a))).join("")
      : `<tr><td colspan="2" class="muted">None recorded.</td></tr>`;

  const findingsBlock = s.findings.length
    ? `<ul class="findings">${s.findings
        .map(
          (f) =>
            `<li class="sev-${escapeHtml(f.severity.toLowerCase())}"><span class="badge">${escapeHtml(
              f.severity,
            )}</span> <strong>${escapeHtml(f.title)}</strong><div class="detail">${escapeHtml(f.detail)}</div></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No findings were raised for this scenario.</p>`;

  const suggestion = s.engineSuggestion ? escapeHtml(REC_LABEL[s.engineSuggestion] ?? s.engineSuggestion) : DASH;
  const decisionBlock = s.humanDecision
    ? `<p class="decision-value">${escapeHtml(
        DECISION_LABEL[s.humanDecision.level] ?? s.humanDecision.level,
      )}</p><p class="decision-meta">Decision #${s.humanDecision.sequence} · ${escapeHtml(
        s.humanDecision.actorDisplay,
      )} · ${fmtDateUtc(s.humanDecision.decidedAtIso)}</p><p class="rationale">${escapeHtml(
        s.humanDecision.rationale,
      )}</p>`
    : `<p class="decision-value muted">No human decision recorded</p>`;

  const summaryBlock = s.scenario.analystSummary
    ? `<section><h2>Analyst summary</h2><p class="summary">${escapeHtml(s.scenario.analystSummary)}</p></section>`
    : "";

  // Self-contained: all CSS inline, no external scripts/styles/fonts/images/network.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offer Memorandum — ${escapeHtml(p.name)}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f1f5f9;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5}
.page{max-width:820px;margin:0 auto;padding:40px 32px;background:#fff}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:#475569;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:32px 0 12px}
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 8px}
.addr{color:#475569;margin:0 0 2px}
.muted{color:#94a3b8}
table{width:100%;border-collapse:collapse;font-size:14px}
th[scope=row]{text-align:left;font-weight:500;color:#475569;padding:6px 12px 6px 0;width:55%;vertical-align:top}
td{text-align:right;font-variant-numeric:tabular-nums;padding:6px 0;border-bottom:1px solid #f1f5f9}
.rec{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
.rec .box{flex:1 1 200px;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px}
.rec .box .k{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin:0 0 6px}
.decision-value{font-size:18px;font-weight:600;margin:0}
.decision-meta{font-size:12px;color:#64748b;margin:4px 0 8px}
.rationale{font-size:13px;color:#334155;margin:0}
.summary{font-size:14px;color:#334155}
ul.findings{list-style:none;padding:0;margin:0}
ul.findings li{border-left:3px solid #cbd5e1;padding:8px 12px;margin:8px 0;background:#f8fafc;border-radius:0 8px 8px 0}
ul.findings li.sev-critical{border-color:#dc2626}
ul.findings li.sev-warning{border-color:#d97706}
ul.findings li.sev-info{border-color:#0284c7}
.badge{display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#475569}
.detail{font-size:13px;color:#475569;margin-top:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
footer{margin-top:36px;border-top:1px solid #e2e8f0;padding-top:14px;font-size:11px;color:#94a3b8}
footer code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
@media print{body{background:#fff}.page{padding:0}}
</style>
</head>
<body>
<div class="page">
<p class="eyebrow">Offer Memorandum · Confidential</p>
<h1>${escapeHtml(p.name)}</h1>
<p class="addr">${addr}</p>
<p class="addr muted">${escapeHtml(s.opportunity.title)} · ${escapeHtml(titleCaseWord(p.assetType))}${
    p.unitCount != null ? ` · ${fmtInt(p.unitCount)} units` : ""
  }</p>

<section>
<h2>Recommendation</h2>
<div class="rec">
<div class="box"><p class="k">Engine suggestion</p><p class="decision-value">${suggestion}</p></div>
<div class="box"><p class="k">Human decision</p>${decisionBlock}</div>
</div>
</section>

<section>
<h2>Deal summary</h2>
<table><tbody>${operatingRows}</tbody></table>
</section>

<section>
<h2>Financing — ${escapeHtml(c.label)}</h2>
<table><tbody>${financingRows}</tbody></table>
</section>

<section>
<h2>Projected returns</h2>
<table><tbody>${returnsRows}</tbody></table>
</section>

<section>
<h2>Findings &amp; risks</h2>
${findingsBlock}
</section>

<section>
<h2>Assumptions</h2>
<div class="two">
<table><tbody><tr><th scope="row" class="muted">Operating</th><td></td></tr>${assumptionRows(
    s.operatingAssumptions,
  )}</tbody></table>
<table><tbody><tr><th scope="row" class="muted">Capital</th><td></td></tr>${assumptionRows(
    c.capitalAssumptions,
  )}</tbody></table>
</div>
</section>

${summaryBlock}

<footer>
Generated ${fmtDateUtc(s.generatedAt)} by ${escapeHtml(s.generatedBy.display)} · Scenario v${fmtInt(
    s.scenario.version,
  )} (${escapeHtml(s.scenario.status)}) · model ${fmtInt(s.scenario.modelVersion)} / calc ${fmtInt(
    s.scenario.calcLibVersion,
  )} / ruleset ${fmtInt(s.scenario.rulesetVersion)}<br>
Fingerprint <code>${escapeHtml(s.scenario.scenarioVersion.slice(0, 16))}</code> · template v${fmtInt(
    s.templateVersion,
  )} · generator v${fmtInt(s.generatorVersion)} · snapshot schema v${fmtInt(s.snapshotSchemaVersion)}<br>
This memorandum is an immutable snapshot of the underwriting model at generation time; later changes to the model do not alter it.
</footer>
</div>
</body>
</html>`;
}

/** Format an assumption value by a small key-suffix convention (…_PCT → %, …_YEARS → years, else USD). */
function fmtAssumption(a: MemoAssumption): string {
  if (a.key.endsWith("_PCT")) return fmtPct(a.value);
  if (a.key.endsWith("_YEARS")) return `${fmtInt(a.value)} yrs`;
  if (a.key === "UNIT_COUNT") return fmtInt(a.value);
  return fmtUsd(a.value);
}
