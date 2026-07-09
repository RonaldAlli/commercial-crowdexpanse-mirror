"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { TaskFormState } from "@/app/(workspace)/tasks/actions";

export type TaskFormValues = {
  title?: string | null;
  description?: string | null;
  status?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
  opportunityId?: string | null;
};

type Option = { value: string; label: string };

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

export function TaskForm({
  action,
  values,
  statuses,
  owners,
  opportunities,
  submitLabel,
  cancelHref,
}: {
  action: (state: TaskFormState, formData: FormData) => Promise<TaskFormState>;
  values?: TaskFormValues;
  statuses: Option[];
  owners: { id: string; name: string }[];
  opportunities: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <LabeledField label="Title" required>
        <input className="input" name="title" required defaultValue={values?.title ?? ""} placeholder="Validate trailing utility reimbursements" />
      </LabeledField>

      <LabeledField label="Description">
        <textarea className="input min-h-[90px] resize-y" name="description" defaultValue={values?.description ?? ""} placeholder="What needs to happen, and any context." />
      </LabeledField>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <LabeledField label="Status">
          <select className="input" name="status" defaultValue={values?.status ?? statuses[0]?.value ?? ""}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Due date">
          <input className="input" name="dueDate" type="date" defaultValue={values?.dueDate ?? ""} />
        </LabeledField>
        <LabeledField label="Owner">
          <select className="input" name="ownerId" defaultValue={values?.ownerId ?? ""}>
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Opportunity">
          <select className="input" name="opportunityId" defaultValue={values?.opportunityId ?? ""}>
            <option value="">None</option>
            {opportunities.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </LabeledField>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-6">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
