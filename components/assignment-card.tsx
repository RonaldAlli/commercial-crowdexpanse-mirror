"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import {
  startAssignmentAction,
  setAssignmentPartiesAction,
  generateAssignmentDraftAction,
  executeAssignmentAction,
  cancelAssignmentAction,
  type AssignmentActionState,
} from "@/app/(workspace)/opportunities/assignment-actions";
import { assignmentStatusLabel, assignmentStatusTone } from "@/lib/assignment";

export type AssignmentView = {
  status: string;
  assignorName: string | null;
  assignorContact: string | null;
  assigneeName: string | null;
  assigneeContact: string | null;
  resolvedAt: string | null; // iso
  resolutionReason: string | null;
  executedFeeUsdSnapshot: number | null;
  executedContractValueUsdSnapshot: number | null;
  executedAssignorNameSnapshot: string | null;
  executedAssigneeNameSnapshot: string | null;
  executedAgreementDocumentIdSnapshot: string | null;
};

export type AssignmentDraft = { id: string; generationSequence: number; generatedAt: string | null };

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50";
const usd = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function AssignmentCard({
  opportunityId,
  assignment,
  drafts,
  feeUsd,
  contractValueUsd,
  canWrite,
  canExecute,
}: {
  opportunityId: string;
  assignment: AssignmentView | null;
  drafts: AssignmentDraft[];
  feeUsd: number | null;
  contractValueUsd: number | null;
  canWrite: boolean;
  canExecute: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignorName, setAssignorName] = useState(assignment?.assignorName ?? "");
  const [assignorContact, setAssignorContact] = useState(assignment?.assignorContact ?? "");
  const [assigneeName, setAssigneeName] = useState(assignment?.assigneeName ?? "");
  const [assigneeContact, setAssigneeContact] = useState(assignment?.assigneeContact ?? "");
  const [executing, setExecuting] = useState(false);
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<AssignmentActionState>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });

  // No record yet.
  if (!assignment) {
    return (
      <div className="px-5 py-6">
        {canWrite ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-slate-500">No assignment is being tracked for this opportunity yet.</p>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => startAssignmentAction(opportunityId))}>
              {pending ? "Starting…" : "Start assignment tracking"}
            </button>
            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No assignment is being tracked for this opportunity.</p>
        )}
      </div>
    );
  }

  const status = assignment.status;
  const terminal = ["EXECUTED", "CANCELLED"].includes(status);
  const executed = status === "EXECUTED";
  const editable = canWrite && !terminal;

  const saveParties = () =>
    run(() =>
      setAssignmentPartiesAction(opportunityId, {
        assignorName,
        assignorContact,
        assigneeName,
        assigneeContact,
      }),
    );

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={assignmentStatusTone(status)} dot>{assignmentStatusLabel(status)}</Badge>
        {terminal ? <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Frozen · immutable</span> : null}
      </div>

      {/* Deal terms — fee + contract value live on the Opportunity (read-only here, AS-3). */}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Assignment fee</dt>
          <dd className="metric text-sm font-medium text-slate-900">{usd(feeUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Underlying contract value</dt>
          <dd className="metric text-sm font-medium text-slate-900">{usd(contractValueUsd)}</dd>
        </div>
      </dl>

      {/* Parties — current values */}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Assignor</dt>
          <dd className="text-sm font-medium text-slate-900">
            {assignment.assignorName ?? "—"}
            {assignment.assignorContact ? <span className="text-xs text-slate-400"> · {assignment.assignorContact}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Assignee</dt>
          <dd className="text-sm font-medium text-slate-900">
            {assignment.assigneeName ?? "—"}
            {assignment.assigneeContact ? <span className="text-xs text-slate-400"> · {assignment.assigneeContact}</span> : null}
          </dd>
        </div>
      </dl>

      {/* Parties editor (mutable until terminal) */}
      {editable ? (
        <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Assignor name
            <input type="text" value={assignorName} disabled={pending} onChange={(e) => setAssignorName(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Assignor contact
            <input type="text" value={assignorContact} disabled={pending} onChange={(e) => setAssignorContact(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Assignee name
            <input type="text" value={assigneeName} disabled={pending} onChange={(e) => setAssigneeName(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Assignee contact
            <input type="text" value={assigneeContact} disabled={pending} onChange={(e) => setAssigneeContact(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn-ghost text-xs" disabled={pending} onClick={saveParties}>Save parties</button>
          </div>
        </div>
      ) : null}

      {/* Agreement drafts (AS-M) — versioned, newest first; the executed one is highlighted. */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">Agreement drafts</p>
          {editable ? (
            <button type="button" className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => generateAssignmentDraftAction(opportunityId))}>
              {drafts.length === 0 ? "Generate draft" : "Regenerate draft"}
            </button>
          ) : null}
        </div>
        {drafts.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {drafts.map((d) => {
              const isExecuted = assignment.executedAgreementDocumentIdSnapshot === d.id;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={isExecuted ? "font-semibold text-emerald-700" : "font-medium text-slate-700"}>Draft {d.generationSequence}</span>
                  {d.generatedAt ? <span className="text-slate-400">{d.generatedAt.slice(0, 10)}</span> : null}
                  {isExecuted ? <Badge tone="success">Executed</Badge> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">No agreement drafted yet.</p>
        )}
      </div>

      {/* Lifecycle transitions */}
      {canWrite && !terminal ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {status === "DRAFTED" ? (
            canExecute ? (
              <button type="button" className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => { setExecuting(true); setNote(""); setCancelling(false); }}>
                Execute assignment
              </button>
            ) : (
              <span className="text-xs text-slate-400">Executing the assignment is an admin action.</span>
            )
          ) : null}
          <button type="button" className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => { setCancelling(true); setReason(""); setExecuting(false); }}>
            Cancel assignment
          </button>
        </div>
      ) : null}

      {/* Execute confirmation (ADMIN only) — optional note */}
      {executing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="text" value={note} placeholder="Optional note (e.g. executed at closing)" onChange={(e) => setNote(e.target.value)} className={`min-w-[16rem] flex-1 ${inputClass}`} />
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await executeAssignmentAction(opportunityId, note);
                if (!res?.error) { setExecuting(false); setNote(""); }
                return res;
              })
            }
          >
            Confirm execution
          </button>
          <button type="button" className="text-xs font-medium text-slate-400 hover:underline" onClick={() => { setExecuting(false); setNote(""); }}>Cancel</button>
        </div>
      ) : null}

      {/* Cancel confirmation — mandatory reason */}
      {cancelling ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="text" value={reason} placeholder="Reason to cancel the assignment" onChange={(e) => setReason(e.target.value)} className={`min-w-[16rem] flex-1 ${inputClass}`} />
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-50"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(async () => {
                const res = await cancelAssignmentAction(opportunityId, reason);
                if (!res?.error) { setCancelling(false); setReason(""); }
                return res;
              })
            }
          >
            Confirm cancellation
          </button>
          <button type="button" className="text-xs font-medium text-slate-400 hover:underline" onClick={() => { setCancelling(false); setReason(""); }}>Back</button>
        </div>
      ) : null}

      {/* Immutable terminal snapshot (AS-D/AS-H) */}
      {executed ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="eyebrow">Executed terms (immutable)</p>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Assignor</dt>
              <dd className="text-sm text-slate-700">{assignment.executedAssignorNameSnapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Assignee</dt>
              <dd className="text-sm text-slate-700">{assignment.executedAssigneeNameSnapshot ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Fee at execution</dt>
              <dd className="metric text-sm text-slate-700">{usd(assignment.executedFeeUsdSnapshot)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Contract value at execution</dt>
              <dd className="metric text-sm text-slate-700">{usd(assignment.executedContractValueUsdSnapshot)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            {assignment.resolvedAt ? `Executed ${assignment.resolvedAt.slice(0, 10)}` : "Executed"}
            {assignment.resolutionReason ? <span> — {assignment.resolutionReason}</span> : null}
          </p>
        </div>
      ) : null}

      {status === "CANCELLED" ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="eyebrow">Cancellation (immutable)</p>
          <p className="mt-2 text-xs text-slate-600">
            <span className="font-medium text-slate-900">Cancelled</span>
            {assignment.resolvedAt ? ` · ${assignment.resolvedAt.slice(0, 10)}` : ""}
            {assignment.resolutionReason ? <span className="text-slate-500"> — {assignment.resolutionReason}</span> : null}
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
