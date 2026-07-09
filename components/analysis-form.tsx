"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { AnalysisFormState } from "@/app/(workspace)/analyzer/actions";

export type AnalysisFormValues = {
  purchasePriceUsd?: number | null;
  renovationBudgetUsd?: number | null;
  closingCostsUsd?: number | null;
  grossIncomeAnnualUsd?: number | null;
  operatingExpensesUsd?: number | null;
  loanAmountUsd?: number | null;
  interestRatePct?: number | null;
  amortizationYears?: number | null;
  analystSummary?: string | null;
};

function num(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function Field({ label, name, value, required, step = "1", hint }: { label: string; name: string; value: number | null | undefined; required?: boolean; step?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input className="input" name={name} type="number" min="0" step={step} required={required} defaultValue={num(value)} />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
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

export function AnalysisForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (state: AnalysisFormState, formData: FormData) => Promise<AnalysisFormState>;
  values?: AnalysisFormValues;
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

      <Section title="Acquisition">
        <Field label="Purchase price (USD)" name="purchasePriceUsd" value={values?.purchasePriceUsd} required />
        <Field label="Renovation budget (USD)" name="renovationBudgetUsd" value={values?.renovationBudgetUsd} />
        <Field label="Closing costs (USD)" name="closingCostsUsd" value={values?.closingCostsUsd} />
      </Section>

      <Section title="Income">
        <Field label="Gross income / yr (USD)" name="grossIncomeAnnualUsd" value={values?.grossIncomeAnnualUsd} />
        <Field label="Operating expenses / yr (USD)" name="operatingExpensesUsd" value={values?.operatingExpensesUsd} />
      </Section>

      <Section title="Debt (optional — enables DSCR & debt yield)">
        <Field label="Loan amount (USD)" name="loanAmountUsd" value={values?.loanAmountUsd} />
        <Field label="Interest rate (%)" name="interestRatePct" value={values?.interestRatePct} step="any" />
        <Field label="Amortization (years)" name="amortizationYears" value={values?.amortizationYears} />
      </Section>

      <section className="space-y-4">
        <p className="eyebrow">Analyst summary</p>
        <textarea className="input min-h-[100px] resize-y" name="analystSummary" defaultValue={values?.analystSummary ?? ""} placeholder="Underwriting notes, assumptions, and recommendation." />
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
