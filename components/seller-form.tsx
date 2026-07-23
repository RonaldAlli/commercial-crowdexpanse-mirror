"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import type { SellerFormState } from "@/app/(workspace)/sellers/actions";
import { CHANNEL_GROUPS } from "@/lib/acquisition-options";

export type SellerFormValues = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  motivation?: string | null;
  acquisitionChannel?: string | null;
  acquisitionCampaign?: string | null;
};

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        className="input"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
      />
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

export function SellerForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (state: SellerFormState, formData: FormData) => Promise<SellerFormState>;
  values?: SellerFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" required defaultValue={values?.name} placeholder="Marcus Henley" />
        <Field label="Company" name="company" defaultValue={values?.company} placeholder="Henley Urban Holdings" />
        <Field label="Email" name="email" type="email" defaultValue={values?.email} placeholder="marcus@example.com" />
        <Field label="Phone" name="phone" defaultValue={values?.phone} placeholder="(404) 555-0184" />
        <Field label="City" name="city" defaultValue={values?.city} placeholder="Atlanta" />
        <Field label="State" name="state" defaultValue={values?.state} placeholder="GA" />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Motivation</span>
        <textarea
          className="input min-h-[96px] resize-y"
          name="motivation"
          defaultValue={values?.motivation ?? ""}
          placeholder="Why is this owner open to selling?"
        />
      </label>

      {/* Acquisition source (Attribution Rule 1) — channel required; campaign optional/free-form. */}
      <div className="border-t border-slate-100 pt-5">
        <p className="eyebrow mb-3">Acquisition source</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Channel<span className="text-rose-500"> *</span>
            </span>
            <select
              className="input"
              name="acquisitionChannel"
              required
              defaultValue={values?.acquisitionChannel ?? ""}
            >
              <option value="" disabled>
                Select a channel…
              </option>
              {CHANNEL_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Field
            label="Campaign"
            name="acquisitionCampaign"
            defaultValue={values?.acquisitionCampaign}
            placeholder="Fulton Probate July 2026"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
