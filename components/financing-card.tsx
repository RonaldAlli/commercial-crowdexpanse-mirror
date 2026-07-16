"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import {
  startFinancingAction,
  advanceFinancingAction,
  setFinancingLenderAction,
  setFinancingMilestoneAction,
  linkFinancingDocumentsAction,
  resolveFinancingAction,
  type FinancingActionState,
} from "@/app/(workspace)/opportunities/financing-actions";
import { financingStatusLabel, financingStatusTone, isValidFinancingTransition } from "@/lib/financing";

export type FinancingView = {
  status: string;
  lenderName: string | null;
  lenderContact: string | null;
  applicationSubmittedDate: string | null; // yyyy-mm-dd
  appraisalOrderedDate: string | null;
  appraisalCompletedDate: string | null;
  commitmentReceivedDate: string | null;
  conditionsReceivedDate: string | null;
  conditionsSatisfiedDate: string | null;
  closingPackageReceivedDate: string | null;
  fundedDate: string | null;
  commitmentLetterDocumentId: string | null;
  appraisalDocumentId: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  resolutionLenderNameSnapshot: string | null;
};

// FC-0: a READ-ONLY reference to the active underwriting scenario's sized debt, shown for
// context only. Financing never owns, copies, caches, or persists these figures.
export type FinancingUnderwritingRef = {
  sizedLoanUsd: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  bindingConstraint: string | null;
} | null;

type DocOption = { id: string; title: string };

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50";
const usd = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const ADVANCE_TARGETS = ["APPLIED", "COMMITTED", "CLEARED"] as const;
const TERMINAL_TARGETS = ["FUNDED", "DENIED", "WITHDRAWN"] as const;
const MILESTONES: { field: string; label: string }[] = [
  { field: "appraisalOrderedDate", label: "Appraisal ordered" },
  { field: "appraisalCompletedDate", label: "Appraisal completed" },
  { field: "conditionsReceivedDate", label: "Conditions received" },
  { field: "closingPackageReceivedDate", label: "Closing package received" },
];

// The dates the lifecycle transitions stamp automatically (read-only here).
const STAMPED: { key: keyof FinancingView; label: string }[] = [
  { key: "applicationSubmittedDate", label: "Application submitted" },
  { key: "commitmentReceivedDate", label: "Commitment received" },
  { key: "conditionsSatisfiedDate", label: "Conditions satisfied" },
  { key: "fundedDate", label: "Funded" },
];

export function FinancingCard({
  opportunityId,
  financing,
  documents,
  underwritingRef,
  canWrite,
  canResolve,
}: {
  opportunityId: string;
  financing: FinancingView | null;
  documents: DocOption[];
  underwritingRef: FinancingUnderwritingRef;
  canWrite: boolean;
  canResolve: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const [lender, setLender] = useState(financing?.lenderName ?? "");
  const [contact, setContact] = useState(financing?.lenderContact ?? "");

  const run = (fn: () => Promise<FinancingActionState>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });

  // FC-0/FC-15 read-only underwriting reference — an EPHEMERAL view rendered above the
  // operational record. It is read through the getActiveScenarioResult seam at render time and
  // NEVER persisted or cached into the FinancingRecord. When no active scenario carries sized
  // debt we say so explicitly rather than storing or showing placeholder values (FC-15).
  const refPanel = (
    <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Underwritten debt · reference only (from active scenario)
      </p>
      {underwritingRef ? (
        <dl className="mt-2 grid gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Sized loan</dt>
            <dd className="metric text-sm font-medium text-slate-900">{usd(underwritingRef.sizedLoanUsd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">DSCR</dt>
            <dd className="text-sm text-slate-700">{underwritingRef.dscr != null ? underwritingRef.dscr.toFixed(2) + "x" : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Debt yield</dt>
            <dd className="text-sm text-slate-700">{underwritingRef.debtYieldPct != null ? underwritingRef.debtYieldPct.toFixed(1) + "%" : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Binding constraint</dt>
            <dd className="text-sm text-slate-700">{underwritingRef.bindingConstraint ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No active underwriting available.</p>
      )}
    </div>
  );

  // No record yet.
  if (!financing) {
    return (
      <div>
        {refPanel}
        <div className="px-5 py-6">
          {canWrite ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-slate-500">No financing is being tracked for this opportunity yet.</p>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => startFinancingAction(opportunityId))}>
                {pending ? "Starting…" : "Start financing tracking"}
              </button>
              {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No financing is being tracked for this opportunity.</p>
          )}
        </div>
      </div>
    );
  }

  const terminal = ["FUNDED", "DENIED", "WITHDRAWN"].includes(financing.status);
  const editable = canWrite && !terminal;
  const status = financing.status;

  const advanceOptions = ADVANCE_TARGETS.filter((t) => isValidFinancingTransition(status as never, t as never));
  const terminalOptions = TERMINAL_TARGETS.filter((t) => isValidFinancingTransition(status as never, t as never));

  const saveLender = () =>
    run(() => setFinancingLenderAction(opportunityId, { lenderName: lender, lenderContact: contact }));

  return (
    <div>
      {refPanel}
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={financingStatusTone(status)} dot>{financingStatusLabel(status)}</Badge>
          {terminal ? <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Frozen · immutable</span> : null}
        </div>

        {/* Current lender + key dates */}
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Lender</dt>
            <dd className="text-sm font-medium text-slate-900">
              {financing.lenderName ?? "—"}
              {financing.lenderContact ? <span className="text-xs text-slate-400"> · {financing.lenderContact}</span> : null}
            </dd>
          </div>
          {STAMPED.map((s) => (
            <div key={s.key}>
              <dt className="text-xs text-slate-500">{s.label}</dt>
              <dd className="text-sm text-slate-700">{(financing[s.key] as string | null) ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {/* Lender editor (mutable until terminal) */}
        {editable ? (
          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <label className="text-xs text-slate-500">Lender name
              <input type="text" value={lender} disabled={pending} onChange={(e) => setLender(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
            </label>
            <label className="text-xs text-slate-500">Lender contact
              <input type="text" value={contact} disabled={pending} onChange={(e) => setContact(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
            </label>
            <div className="flex items-end">
              <button type="button" className="btn-ghost text-xs" disabled={pending} onClick={saveLender}>Save lender</button>
            </div>
          </div>
        ) : null}

        {/* Informational milestone dates */}
        {editable ? (
          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
            {MILESTONES.map((m) => (
              <label key={m.field} className="text-xs text-slate-500">{m.label}
                <input
                  type="date"
                  defaultValue={(financing[m.field as keyof FinancingView] as string | null) ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => setFinancingMilestoneAction(opportunityId, m.field, e.target.value))}
                  className={`mt-1 w-full ${inputClass}`}
                />
              </label>
            ))}
          </div>
        ) : null}

        {/* Documents: commitment letter + appraisal */}
        {editable ? (
          <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-500">Commitment letter
              <select
                value={financing.commitmentLetterDocumentId ?? ""}
                disabled={pending}
                className={inputClass}
                onChange={(e) => run(() => linkFinancingDocumentsAction(opportunityId, { commitmentLetterDocumentId: e.target.value }))}
              >
                <option value="">None</option>
                {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">Appraisal
              <select
                value={financing.appraisalDocumentId ?? ""}
                disabled={pending}
                className={inputClass}
                onChange={(e) => run(() => linkFinancingDocumentsAction(opportunityId, { appraisalDocumentId: e.target.value }))}
              >
                <option value="">None</option>
                {documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        {/* Lifecycle transitions */}
        {canWrite && !terminal ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {advanceOptions.map((t) => (
              <button key={t} type="button" className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => advanceFinancingAction(opportunityId, t))}>
                Mark {financingStatusLabel(t).toLowerCase()}
              </button>
            ))}
            {terminalOptions.length > 0 ? (
              canResolve ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Resolve:</span>
                  {terminalOptions.map((t) => (
                    <button key={t} type="button" className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => { setResolving(t); setReason(""); }}>
                      {financingStatusLabel(t)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-slate-400">Resolving financing (funded / denied / withdrawn) is an admin action.</span>
              )
            ) : null}
          </div>
        ) : null}

        {/* Resolution reason capture (ADMIN only) */}
        {resolving ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="text" value={reason} placeholder={`Reason to mark financing ${financingStatusLabel(resolving).toLowerCase()}`} onChange={(e) => setReason(e.target.value)} className={`min-w-[16rem] flex-1 ${inputClass}`} />
            <button
              type="button"
              className="btn-ghost text-xs disabled:opacity-50"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(async () => {
                  const res = await resolveFinancingAction(opportunityId, resolving, reason);
                  if (!res?.error) { setResolving(null); setReason(""); }
                  return res;
                })
              }
            >
              Confirm {financingStatusLabel(resolving).toLowerCase()}
            </button>
            <button type="button" className="text-xs font-medium text-slate-400 hover:underline" onClick={() => { setResolving(null); setReason(""); }}>Cancel</button>
          </div>
        ) : null}

        {/* Immutable terminal snapshot (FC-J) */}
        {terminal ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="eyebrow">Resolution (immutable)</p>
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">{financingStatusLabel(status)}</span>
              {financing.resolutionLenderNameSnapshot ? ` · ${financing.resolutionLenderNameSnapshot}` : ""}
              {financing.resolvedAt ? ` · ${financing.resolvedAt.slice(0, 10)}` : ""}
              {financing.resolutionReason ? <span className="text-slate-500"> — {financing.resolutionReason}</span> : null}
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs font-medium text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}
