"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { PropertyFormState } from "@/app/(workspace)/properties/actions";

export type PropertyFormValues = {
  name?: string | null;
  assetType?: string | null;
  status?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  county?: string | null;
  sellerId?: string | null;
  unitCount?: number | null;
  squareFeet?: number | null;
  acreage?: number | null;
  yearBuilt?: number | null;
  occupancyRate?: number | null;
  noiAnnualUsd?: number | null;
  askingPriceUsd?: number | null;
  estimatedValueUsd?: number | null;
  capRate?: number | null;
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <p className="eyebrow">{title}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
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

export function PropertyForm({
  action,
  values,
  sellers,
  assetTypes,
  statuses,
  organizationName,
  submitLabel,
  cancelHref,
}: {
  action: (state: PropertyFormState, formData: FormData) => Promise<PropertyFormState>;
  values?: PropertyFormValues;
  sellers: { id: string; name: string }[];
  assetTypes: Option[];
  statuses: string[];
  organizationName: string;
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

      <Section title="General">
        <LabeledField label="Property name" required>
          <input className="input" name="name" required defaultValue={values?.name ?? ""} placeholder="Peachtree Heights Lofts" />
        </LabeledField>
        <LabeledField label="Asset type" required>
          <select className="input" name="assetType" required defaultValue={values?.assetType ?? ""}>
            <option value="" disabled>
              Select asset type…
            </option>
            {assetTypes.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Status">
          <select className="input" name="status" defaultValue={values?.status ?? ""}>
            <option value="">—</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Address" required>
          <input className="input" name="addressLine1" required defaultValue={values?.addressLine1 ?? ""} placeholder="1200 Peachtree St NE" />
        </LabeledField>
        <LabeledField label="City" required>
          <input className="input" name="city" required defaultValue={values?.city ?? ""} placeholder="Atlanta" />
        </LabeledField>
        <LabeledField label="State" required>
          <input className="input" name="state" required defaultValue={values?.state ?? ""} placeholder="GA" />
        </LabeledField>
        <LabeledField label="ZIP">
          <input className="input" name="postalCode" defaultValue={values?.postalCode ?? ""} placeholder="30309" />
        </LabeledField>
        <LabeledField label="County">
          <input className="input" name="county" defaultValue={values?.county ?? ""} placeholder="Fulton" />
        </LabeledField>
      </Section>

      <Section title="Ownership">
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
        <LabeledField label="Organization">
          <input className="input bg-slate-50 text-slate-500" value={organizationName} disabled readOnly />
        </LabeledField>
      </Section>

      <Section title="Commercial">
        <LabeledField label="Units">
          <input className="input" name="unitCount" type="number" min="0" step="1" defaultValue={num(values?.unitCount)} />
        </LabeledField>
        <LabeledField label="Square feet">
          <input className="input" name="squareFeet" type="number" min="0" step="1" defaultValue={num(values?.squareFeet)} />
        </LabeledField>
        <LabeledField label="Acres">
          <input className="input" name="acreage" type="number" min="0" step="any" defaultValue={num(values?.acreage)} />
        </LabeledField>
        <LabeledField label="Year built">
          <input className="input" name="yearBuilt" type="number" min="1800" step="1" defaultValue={num(values?.yearBuilt)} />
        </LabeledField>
        <LabeledField label="Occupancy (%)">
          <input className="input" name="occupancyRate" type="number" min="0" max="100" step="any" defaultValue={num(values?.occupancyRate)} />
        </LabeledField>
        <LabeledField label="NOI (annual USD)">
          <input className="input" name="noiAnnualUsd" type="number" min="0" step="1" defaultValue={num(values?.noiAnnualUsd)} />
        </LabeledField>
        <LabeledField label="Asking price (USD)">
          <input className="input" name="askingPriceUsd" type="number" min="0" step="1" defaultValue={num(values?.askingPriceUsd)} />
        </LabeledField>
        <LabeledField label="Estimated value (USD)">
          <input className="input" name="estimatedValueUsd" type="number" min="0" step="1" defaultValue={num(values?.estimatedValueUsd)} />
        </LabeledField>
        <LabeledField label="Cap rate (%)">
          <input className="input" name="capRate" type="number" min="0" step="any" defaultValue={num(values?.capRate)} />
        </LabeledField>
      </Section>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-6">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
