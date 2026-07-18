"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import type { OwnerContactFormState } from "@/app/(workspace)/owners/actions";

export type OwnerContactFormValues = {
  label?: string | null;
  contactName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mailingAddress?: string | null;
  notes?: string | null;
  isPrimary?: boolean | null;
};

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input className="input" name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
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

export function OwnerContactForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (state: OwnerContactFormState, formData: FormData) => Promise<OwnerContactFormState>;
  values?: OwnerContactFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Label" name="label" defaultValue={values?.label} placeholder="Primary owner" />
        <Field label="Contact name" name="contactName" defaultValue={values?.contactName} placeholder="Janet Morris" />
        <Field label="Company" name="company" defaultValue={values?.company} placeholder="Morris Family Office" />
        <Field label="Email" name="email" type="email" defaultValue={values?.email} placeholder="janet@example.com" />
        <Field label="Phone" name="phone" defaultValue={values?.phone} placeholder="(404) 555-0184" />
        <Field label="Mailing address" name="mailingAddress" defaultValue={values?.mailingAddress} placeholder="123 Peachtree St, Atlanta, GA 30303" />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Notes</span>
        <textarea
          className="input min-h-[96px] resize-y"
          name="notes"
          defaultValue={values?.notes ?? ""}
          placeholder="Assistant gatekeeper, best time to call, mailing preference, broker-only contact, etc."
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isPrimary" value="true" defaultChecked={Boolean(values?.isPrimary)} />
        Mark as primary owner contact
      </label>

      <div className="flex items-center gap-2 pt-1">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
