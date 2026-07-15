"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { RefreshFormState } from "@/app/(workspace)/properties/refresh-actions";

// Property manual-refresh form (v1.2, Commit 2b). Structural sibling of
// OwnerRefreshForm — same useFormState wiring, SubmitButton, and outcome banners —
// but its two inputs are the projected Property fields (yearBuilt, squareFeet),
// both integers. Client-side min/max + numeric input mode give immediate browser
// validation so obviously-out-of-range input never reaches the server; the server
// (via propertyManualAdapter.normalizePropertyValue) remains the authority and is
// unchanged. Anything that still slips through and fails normalization records no
// signal and surfaces as NOOP — same contract as Owner.

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record via manual source"}
    </button>
  );
}

function outcomeText(o: NonNullable<NonNullable<RefreshFormState>["outcome"]>) {
  if (o.status === "NOOP") return "No change — the submitted value already matches the current record.";
  if (o.status === "SUCCEEDED") return `Recorded — ${o.signalsAccepted} signal(s) accepted${o.signalsSuperseded ? `, ${o.signalsSuperseded} superseded` : ""}.`;
  return o.status;
}

export function PropertyRefreshForm({ action }: { action: (state: RefreshFormState, formData: FormData) => Promise<RefreshFormState> }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-slate-500">
        This is <span className="font-medium text-slate-600">not the same as Edit</span>. Editing directly maintains the property; recording via the
        manual <span className="font-medium text-slate-600">source adapter</span> captures a source-attributed observation, accepts signals, runs
        projection, and logs a refresh job. Fill in only the fields you are recording.
      </p>

      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}
      {state?.outcome ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{outcomeText(state.outcome)}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Year built</span>
          <input className="input" name="yearBuilt" type="number" inputMode="numeric" min={1600} max={2100} step={1} placeholder="(leave blank to skip)" />
          <span className="mt-1 block text-xs text-slate-400">A 4-digit year between 1600 and 2100.</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Square feet</span>
          <input className="input" name="squareFeet" type="number" inputMode="numeric" min={0} step={1} placeholder="(leave blank to skip)" />
          <span className="mt-1 block text-xs text-slate-400">A non-negative whole number.</span>
        </label>
      </div>

      <SubmitButton />
    </form>
  );
}
