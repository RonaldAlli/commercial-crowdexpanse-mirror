"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { OpportunityFormState } from "@/app/(workspace)/opportunities/actions";

export type OpportunityFormValues = {
  title?: string | null;
  propertyId?: string | null;
  sellerId?: string | null;
  stage?: string | null;
  source?: string | null;
  priority?: string | null;
  targetCloseDate?: string | null;
  contractValueUsd?: number | null;
  assignmentFeeUsd?: number | null;
  summary?: string | null;
};

type Option = { value: string; label: string };

function num(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function LabeledField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function OpportunityForm({
  action,
  values,
  properties,
  sellers,
  stages,
  priorities,
  submitLabel,
  cancelHref,
}: {
  action: (state: OpportunityFormState, formData: FormData) => Promise<OpportunityFormState>;
  values?: OpportunityFormValues;
  properties: Option[];
  sellers: { id: string; name: string }[];
  stages: Option[];
  priorities: string[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-8">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      {properties.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          Add a property first — an opportunity must be linked to one.
        </p>
      ) : null}

      <section className="space-y-4">
        <p className="eyebrow">Deal</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <LabeledField label="Title" required>
            <input className="input" name="title" required defaultValue={values?.title ?? ""} placeholder="Peachtree Heights direct acquisition" />
          </LabeledField>
          <LabeledField label="Stage" required>
            <select className="input" name="stage" defaultValue={values?.stage ?? stages[0]?.value ?? ""}>
              {stages.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Property" required>
            <select className="input" name="propertyId" required defaultValue={values?.propertyId ?? ""}>
              <option value="" disabled>
                Select property…
              </option>
              {properties.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Seller">
            <select className="input" name="sellerId" defaultValue={values?.sellerId ?? ""}>
              <option value="">Unassigned</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </LabeledField>
        </div>
      </section>

      <section className="space-y-4">
        <p className="eyebrow">Deal terms</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <LabeledField label="Source">
            <input className="input" name="source" defaultValue={values?.source ?? ""} placeholder="Expired listing" />
          </LabeledField>
          <LabeledField label="Priority">
            <select className="input" name="priority" defaultValue={values?.priority ?? ""}>
              <option value="">—</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Target close date">
            <input className="input" name="targetCloseDate" type="date" defaultValue={values?.targetCloseDate ?? ""} />
          </LabeledField>
          <LabeledField label="Contract value (USD)">
            <input className="input" name="contractValueUsd" type="number" min="0" step="1" defaultValue={num(values?.contractValueUsd)} />
          </LabeledField>
          <LabeledField label="Assignment fee (USD)">
            <input className="input" name="assignmentFeeUsd" type="number" min="0" step="1" defaultValue={num(values?.assignmentFeeUsd)} />
          </LabeledField>
        </div>
      </section>

      <section className="space-y-4">
        <p className="eyebrow">Summary</p>
        <textarea
          className="input min-h-[110px] resize-y"
          name="summary"
          defaultValue={values?.summary ?? ""}
          placeholder="Deal thesis, next steps, and context."
        />
      </section>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-6">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
