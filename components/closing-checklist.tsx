"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import {
  startClosingChecklist,
  completeClosingItem,
  reopenClosingItem,
  markClosingItemNotApplicable,
  waiveClosingItem,
  setClosingItemOwner,
  setClosingItemDueDate,
  linkClosingItemDocument,
  type ClosingActionState,
} from "@/app/(workspace)/opportunities/closing-actions";
import { checklistStatusLabel, checklistStatusTone } from "@/lib/closing-options";

export type ChecklistItemView = {
  id: string;
  label: string;
  description: string | null;
  required: boolean;
  status: string;
  ownerId: string | null;
  dueDate: string | null; // yyyy-mm-dd
  waiverReason: string | null;
  evidenceDocumentId: string | null;
  completionEvidenceType: string;
};

type Member = { id: string; name: string };
type DocumentOption = { id: string; title: string };

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50";

function ClosingItemRow({
  opportunityId,
  item,
  members,
  documents,
  canWrite,
  canWaive,
}: {
  opportunityId: string;
  item: ChecklistItemView;
  members: Member[];
  documents: DocumentOption[];
  canWrite: boolean;
  canWaive: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState("");

  // Run an action, surfacing any {error} it returns and clearing prior errors.
  const run = (fn: () => Promise<ClosingActionState>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
    });

  const isComplete = item.status === "COMPLETE";
  const isWaived = item.status === "WAIVED";
  const isNA = item.status === "NOT_APPLICABLE";
  const showEvidence = item.completionEvidenceType === "DOCUMENT" && documents.length > 0;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">{item.label}</span>
            {item.required ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">Required</span>
            ) : (
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Optional</span>
            )}
            <Badge tone={checklistStatusTone(item.status)}>{checklistStatusLabel(item.status)}</Badge>
          </div>
          {item.description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p> : null}
          {isWaived && item.waiverReason ? (
            <p className="mt-1 text-xs text-amber-700">Waived: {item.waiverReason}</p>
          ) : null}
        </div>

        {canWrite ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {!isComplete ? (
              <button
                type="button"
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => completeClosingItem(opportunityId, item.id))}
              >
                Mark complete
              </button>
            ) : null}
            {!item.required && !isNA ? (
              <button
                type="button"
                className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => markClosingItemNotApplicable(opportunityId, item.id))}
              >
                N/A
              </button>
            ) : null}
            {item.required && canWaive && !isWaived ? (
              <button
                type="button"
                className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => setWaiving((v) => !v)}
              >
                Waive
              </button>
            ) : null}
            {item.status !== "PENDING" ? (
              <button
                type="button"
                className="text-xs font-medium text-slate-500 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => reopenClosingItem(opportunityId, item.id))}
              >
                Reopen
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Waive reason capture (ADMIN only, required item) */}
      {canWrite && waiving ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={reason}
            placeholder="Reason for waiving this required item"
            onChange={(e) => setReason(e.target.value)}
            className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
          <button
            type="button"
            className="btn-ghost text-xs disabled:opacity-50"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(async () => {
                const res = await waiveClosingItem(opportunityId, item.id, reason);
                if (!res?.error) {
                  setWaiving(false);
                  setReason("");
                }
                return res;
              })
            }
          >
            Confirm waive
          </button>
          <button
            type="button"
            className="text-xs font-medium text-slate-400 hover:underline"
            onClick={() => {
              setWaiving(false);
              setReason("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* Owner / due date / evidence metadata */}
      {canWrite ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Owner
            <select
              value={item.ownerId ?? ""}
              disabled={pending}
              className={selectClass}
              onChange={(e) => run(() => setClosingItemOwner(opportunityId, item.id, e.target.value))}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Due
            <input
              type="date"
              defaultValue={item.dueDate ?? ""}
              disabled={pending}
              className={selectClass}
              onChange={(e) => run(() => setClosingItemDueDate(opportunityId, item.id, e.target.value))}
            />
          </label>
          {showEvidence ? (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Evidence
              <select
                value={item.evidenceDocumentId ?? ""}
                disabled={pending}
                className={selectClass}
                onChange={(e) => run(() => linkClosingItemDocument(opportunityId, item.id, e.target.value))}
              >
                <option value="">None</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
    </li>
  );
}

/** Materializes the checklist from the org's active template on first use (CC-10). */
export function StartClosingChecklistButton({ opportunityId }: { opportunityId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startClosingChecklist(opportunityId);
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? "Starting…" : "Start closing checklist"}
      </button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

/** The interactive closing checklist — one row per item, grouped upstream by category. */
export function ClosingChecklist({
  opportunityId,
  items,
  members,
  documents,
  canWrite,
  canWaive,
}: {
  opportunityId: string;
  items: ChecklistItemView[];
  members: Member[];
  documents: DocumentOption[];
  canWrite: boolean;
  canWaive: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <ClosingItemRow
          key={item.id}
          opportunityId={opportunityId}
          item={item}
          members={members}
          documents={documents}
          canWrite={canWrite}
          canWaive={canWaive}
        />
      ))}
    </ul>
  );
}
