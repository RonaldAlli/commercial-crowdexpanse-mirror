"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { OwnerCandidateNotice } from "@/components/owner-candidate-notice";
import type { OwnerFormState } from "@/app/(workspace)/owners/actions";

const ENTITY_TYPES = ["INDIVIDUAL", "LLC", "TRUST", "CORPORATION", "PARTNERSHIP", "REIT", "GOVERNMENT", "OTHER", "UNKNOWN"] as const;

export type OwnerFormValues = { displayName?: string | null; entityType?: string | null };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function OwnerForm({
  action,
  mode,
  values,
  overrides,
  submitLabel,
  cancelHref,
}: {
  action: (state: OwnerFormState, formData: FormData) => Promise<OwnerFormState>;
  mode: "create" | "edit";
  values?: OwnerFormValues;
  /** Edit mode only: which projected fields currently carry an active override pin. */
  overrides?: { displayName?: boolean; entityType?: boolean };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  // After a create-time duplicate warning, preserve what the user typed and arm
  // the confirm flag so the next submit ("Create anyway") bypasses the check.
  const hasCandidates = Boolean(state?.candidates?.length);
  const displayName = state?.values?.displayName ?? values?.displayName ?? "";
  const entityType = state?.values?.entityType ?? values?.entityType ?? "UNKNOWN";

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}

      {hasCandidates ? <OwnerCandidateNotice candidates={state!.candidates!} /> : null}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Owner name<span className="text-rose-500"> *</span>
        </span>
        <input className="input" name="displayName" required defaultValue={displayName} placeholder="Riverstone Capital LLC" />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Entity type</span>
        <select className="input" name="entityType" defaultValue={entityType}>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>

      {mode === "edit" ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-medium text-slate-500">
            Pinning marks a value as a manual override — it stays sticky against lower-authority automated sources.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="pinDisplayName" value="true" defaultChecked={overrides?.displayName} />
            Pin owner name
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="pinEntityType" value="true" defaultChecked={overrides?.entityType} />
            Pin entity type
          </label>
        </div>
      ) : null}

      {/* Armed only after a duplicate warning, so "Create anyway" proceeds. */}
      {mode === "create" ? <input type="hidden" name="confirm" value={hasCandidates ? "true" : ""} /> : null}

      <div className="flex items-center gap-2 pt-1">
        <SubmitButton label={hasCandidates ? "Create anyway" : submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
