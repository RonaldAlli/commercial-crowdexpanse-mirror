"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reusable attestation dialog — shown when a stage transition (or any future policy-gated action)
 * REQUIRES_ATTESTATION: it lists what authoritative truth is missing and collects a reason before the
 * caller proceeds. Driven entirely by props so every future rule reuses it without change.
 */
export function AttestationDialog({
  open,
  title = "This stage requires attestation",
  targetLabel,
  message,
  suggestedAction,
  missingArtifacts,
  submitting = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  targetLabel: string;
  message?: string;
  suggestedAction?: string;
  missingArtifacts: string[];
  submitting?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      const t = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;
  const canSubmit = reason.trim().length > 0 && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-600">
          Moving to <span className="font-medium">{targetLabel}</span> without its usual proof.
          {message ? ` ${message}` : ""}
        </p>

        {missingArtifacts.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-900">Missing</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
              {missingArtifacts.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        ) : null}

        <label className="mt-3 block text-xs font-medium text-slate-700">
          Reason (recorded on the activity log)
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={suggestedAction || "e.g. Imported deal already at this stage; documentation held offline."}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={submitting}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={!canSubmit}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
            {submitting ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
