"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { RefreshFormState } from "@/app/(workspace)/owners/refresh-actions";

const ENTITY_TYPES = ["", "INDIVIDUAL", "LLC", "TRUST", "CORPORATION", "PARTNERSHIP", "REIT", "GOVERNMENT", "OTHER", "UNKNOWN"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record via manual source"}
    </button>
  );
}

function outcomeText(o: NonNullable<NonNullable<RefreshFormState>["outcome"]>) {
  if (o.status === "NOOP") return "No change — the submitted value already matches the current signal.";
  if (o.status === "SUCCEEDED") return `Recorded — ${o.signalsAccepted} signal(s) accepted${o.signalsSuperseded ? `, ${o.signalsSuperseded} superseded` : ""}.`;
  return o.status;
}

export function OwnerRefreshForm({ action }: { action: (state: RefreshFormState, formData: FormData) => Promise<RefreshFormState> }) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-slate-500">
        This is <span className="font-medium text-slate-600">not the same as Edit</span>. Editing directly maintains the owner; recording via the
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
          <span className="mb-1 block text-xs font-medium text-slate-600">Owner name</span>
          <input className="input" name="displayName" placeholder="(leave blank to skip)" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Entity type</span>
          <select className="input" name="entityType" defaultValue="">
            {ENTITY_TYPES.map((t) => (
              <option key={t || "blank"} value={t}>
                {t ? t.charAt(0) + t.slice(1).toLowerCase() : "(leave blank to skip)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SubmitButton />
    </form>
  );
}
