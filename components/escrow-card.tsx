"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import {
  openEscrowAction,
  updateEscrowDetailsAction,
  markEscrowDepositedAction,
  linkEscrowProofAction,
  resolveEscrowAction,
  type EscrowActionState,
} from "@/app/(workspace)/opportunities/escrow-actions";
import { completeClosingItem } from "@/app/(workspace)/opportunities/closing-actions";
import { escrowStatusLabel, escrowStatusTone } from "@/lib/escrow";

export type EscrowEventView = {
  type: string;
  amountUsdSnapshot: number | null;
  holderNameSnapshot: string | null;
  proofDocumentIdSnapshot: string | null;
  reason: string | null;
  occurredAt: string;
};

export type EscrowView = {
  status: string;
  earnestAmountUsd: number | null;
  escrowHolderName: string | null;
  escrowHolderContact: string | null;
  earnestDueDate: string | null; // yyyy-mm-dd
  depositedDate: string | null;
  contingencyDeadline: string | null;
  proofOfDepositDocumentId: string | null;
  resolutionReason: string | null;
  events: EscrowEventView[];
};

type DocOption = { id: string; title: string };
type EscrowChecklistItem = { id: string; label: string; status: string };

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50";
const usd = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const TERMINAL = new Set(["RELEASED", "REFUNDED", "FORFEITED"]);

export function EscrowCard({
  opportunityId,
  escrow,
  documents,
  canWrite,
  canResolve,
  escrowChecklistItem,
}: {
  opportunityId: string;
  escrow: EscrowView | null;
  documents: DocOption[];
  canWrite: boolean;
  canResolve: boolean;
  escrowChecklistItem: EscrowChecklistItem | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Controlled details editor (initialized from the record).
  const [amount, setAmount] = useState(escrow?.earnestAmountUsd != null ? String(escrow.earnestAmountUsd) : "");
  const [holder, setHolder] = useState(escrow?.escrowHolderName ?? "");
  const [contact, setContact] = useState(escrow?.escrowHolderContact ?? "");
  const [earnestDue, setEarnestDue] = useState(escrow?.earnestDueDate ?? "");
  const [contingency, setContingency] = useState(escrow?.contingencyDeadline ?? "");

  const run = (fn: () => Promise<EscrowActionState>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });

  const terminal = escrow ? TERMINAL.has(escrow.status) : false;
  const editable = canWrite && escrow != null && !terminal;

  // No record yet.
  if (!escrow) {
    return (
      <div className="px-5 py-6">
        {canWrite ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-slate-500">No escrow opened for this opportunity yet.</p>
            <button
              type="button"
              className="btn-ghost"
              disabled={pending}
              onClick={() => run(() => openEscrowAction(opportunityId))}
            >
              {pending ? "Opening…" : "Open escrow"}
            </button>
            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No escrow has been opened for this opportunity.</p>
        )}
      </div>
    );
  }

  const saveDetails = () =>
    run(() =>
      updateEscrowDetailsAction(opportunityId, {
        earnestAmountUsd: amount,
        escrowHolderName: holder,
        escrowHolderContact: contact,
        earnestDueDate: earnestDue,
        contingencyDeadline: contingency,
      }),
    );

  const showSync =
    escrowChecklistItem != null &&
    (escrow.status === "DEPOSITED" || terminal) &&
    escrowChecklistItem.status !== "COMPLETE" &&
    escrowChecklistItem.status !== "WAIVED";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={escrowStatusTone(escrow.status)} dot>{escrowStatusLabel(escrow.status)}</Badge>
        {terminal ? <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Frozen · immutable</span> : null}
      </div>

      {/* Current values */}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Earnest money</dt>
          <dd className="metric text-sm font-medium text-slate-900">{usd(escrow.earnestAmountUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Escrow holder</dt>
          <dd className="text-sm font-medium text-slate-900">{escrow.escrowHolderName ?? "—"}{escrow.escrowHolderContact ? <span className="text-xs text-slate-400"> · {escrow.escrowHolderContact}</span> : null}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Earnest due</dt>
          <dd className="text-sm text-slate-700">{escrow.earnestDueDate ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Contingency deadline</dt>
          <dd className="text-sm text-slate-700">{escrow.contingencyDeadline ?? "—"}</dd>
        </div>
      </dl>

      {/* Details editor (mutable until terminal) */}
      {editable ? (
        <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Earnest amount (USD)
            <input type="text" inputMode="numeric" value={amount} disabled={pending} onChange={(e) => setAmount(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Escrow holder
            <input type="text" value={holder} disabled={pending} onChange={(e) => setHolder(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Holder contact
            <input type="text" value={contact} disabled={pending} onChange={(e) => setContact(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Earnest due date
            <input type="date" value={earnestDue} disabled={pending} onChange={(e) => setEarnestDue(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <label className="text-xs text-slate-500">Contingency deadline
            <input type="date" value={contingency} disabled={pending} onChange={(e) => setContingency(e.target.value)} className={`mt-1 w-full ${inputClass}`} />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn-ghost text-xs" disabled={pending} onClick={saveDetails}>Save details</button>
          </div>
        </div>
      ) : null}

      {/* Proof of deposit */}
      {canWrite && !terminal ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Proof of deposit
            <select
              value={escrow.proofOfDepositDocumentId ?? ""}
              disabled={pending}
              className={inputClass}
              onChange={(e) => run(() => linkEscrowProofAction(opportunityId, e.target.value))}
            >
              <option value="">None</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {/* Lifecycle transitions */}
      {canWrite && !terminal ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {escrow.status === "OPENED" ? (
            <button type="button" className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => markEscrowDepositedAction(opportunityId))}>
              Mark earnest money deposited
            </button>
          ) : null}
          {escrow.status === "DEPOSITED" && canResolve ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Resolve:</span>
              {(["RELEASED", "REFUNDED", "FORFEITED"] as const).map((t) => (
                <button key={t} type="button" className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => { setResolving(t); setReason(""); }}>
                  {escrowStatusLabel(t)}
                </button>
              ))}
            </div>
          ) : null}
          {escrow.status === "DEPOSITED" && !canResolve ? (
            <span className="text-xs text-slate-400">Resolving escrow (release / refund / forfeit) is an admin action.</span>
          ) : null}
        </div>
      ) : null}

      {/* Resolution reason capture (ADMIN only) */}
      {resolving ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input type="text" value={reason} placeholder={`Reason to mark escrow ${escrowStatusLabel(resolving).toLowerCase()}`} onChange={(e) => setReason(e.target.value)} className={`min-w-[16rem] flex-1 ${inputClass}`} />
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-50"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(async () => {
                const res = await resolveEscrowAction(opportunityId, resolving, reason);
                if (!res?.error) { setResolving(null); setReason(""); }
                return res;
              })
            }
          >
            Confirm {escrowStatusLabel(resolving).toLowerCase()}
          </button>
          <button type="button" className="text-xs font-medium text-slate-400 hover:underline" onClick={() => { setResolving(null); setReason(""); }}>Cancel</button>
        </div>
      ) : null}

      {/* EC-J: optional, explicit, never-automatic checklist sync */}
      {showSync && escrowChecklistItem ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">Escrow is deposited. Optionally mark the related checklist item complete:</span>
          <button type="button" className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => completeClosingItem(opportunityId, escrowChecklistItem.id))}>
            Mark “{escrowChecklistItem.label}” complete
          </button>
        </div>
      ) : null}

      {/* Immutable terminal history (EC-I/EC-11) */}
      {escrow.events.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="eyebrow">Escrow history (immutable)</p>
          <ul className="mt-2 space-y-2">
            {escrow.events.map((ev, i) => (
              <li key={i} className="text-xs text-slate-600">
                <span className="font-medium text-slate-900">{escrowStatusLabel(ev.type)}</span> · {usd(ev.amountUsdSnapshot)}
                {ev.holderNameSnapshot ? ` · ${ev.holderNameSnapshot}` : ""}
                {ev.reason ? <span className="text-slate-500"> — {ev.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
