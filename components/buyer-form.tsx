"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { BuyerFormState } from "@/app/(workspace)/buyers/actions";

export type BuyerFormValues = {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  targetAssetTypes?: string[];
  targetStates?: string[];
  minimumPurchaseUsd?: number | null;
  maximumPurchaseUsd?: number | null;
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

export function BuyerForm({
  action,
  values,
  assetTypes,
  submitLabel,
  cancelHref,
}: {
  action: (state: BuyerFormState, formData: FormData) => Promise<BuyerFormState>;
  values?: BuyerFormValues;
  assetTypes: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const selectedTypes = new Set(values?.targetAssetTypes ?? []);

  return (
    <form action={formAction} className="space-y-8">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <section className="space-y-4">
        <p className="eyebrow">Contact</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <LabeledField label="Name" required>
            <input className="input" name="name" required defaultValue={values?.name ?? ""} placeholder="Dana Price" />
          </LabeledField>
          <LabeledField label="Company">
            <input className="input" name="company" defaultValue={values?.company ?? ""} placeholder="Summit Storage Partners" />
          </LabeledField>
          <LabeledField label="Email">
            <input className="input" name="email" type="email" defaultValue={values?.email ?? ""} placeholder="dana@example.com" />
          </LabeledField>
          <LabeledField label="Phone">
            <input className="input" name="phone" defaultValue={values?.phone ?? ""} placeholder="(404) 555-0184" />
          </LabeledField>
        </div>
      </section>

      <section className="space-y-4">
        <p className="eyebrow">Buy box</p>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Target asset types</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {assetTypes.map((a) => (
              <label
                key={a.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
              >
                <input
                  type="checkbox"
                  name="targetAssetTypes"
                  value={a.value}
                  defaultChecked={selectedTypes.has(a.value)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <LabeledField label="Target states">
          <input
            className="input"
            name="targetStates"
            defaultValue={(values?.targetStates ?? []).join(", ")}
            placeholder="GA, FL, TN"
          />
          <span className="mt-1 block text-xs text-slate-400">Comma-separated two-letter codes.</span>
        </LabeledField>

        <div className="grid gap-5 sm:grid-cols-2">
          <LabeledField label="Minimum purchase (USD)">
            <input className="input" name="minimumPurchaseUsd" type="number" min="0" step="1" defaultValue={num(values?.minimumPurchaseUsd)} placeholder="4000000" />
          </LabeledField>
          <LabeledField label="Maximum purchase (USD)">
            <input className="input" name="maximumPurchaseUsd" type="number" min="0" step="1" defaultValue={num(values?.maximumPurchaseUsd)} placeholder="20000000" />
          </LabeledField>
        </div>
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
