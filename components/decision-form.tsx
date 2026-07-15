"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { DecisionFormState } from "@/app/(workspace)/analyzer/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record decision"}
    </button>
  );
}

// The decided-recommendation form (Commit 3d). A thin client wrapper over the server
// action — the action re-authorizes on UNDERWRITING_APPROVAL and the service enforces the
// LOCKED gate + append-only audit. This form never computes or persists anything itself.
export function DecisionForm({
  action,
}: {
  action: (state: DecisionFormState, formData: FormData) => Promise<DecisionFormState>;
}) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Decision</span>
          <select name="decision" className="input" defaultValue="APPROVED">
            <option value="APPROVED">Approved</option>
            <option value="DECLINED">Declined</option>
            <option value="DEFERRED">Deferred</option>
          </select>
        </label>
      </div>
      <textarea
        name="rationale"
        required
        className="input min-h-[80px] resize-y"
        placeholder="Rationale (required) — why this decision, reviewed against this locked snapshot."
      />
      <Submit />
    </form>
  );
}
