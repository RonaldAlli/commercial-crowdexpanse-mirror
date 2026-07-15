"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { AnalysisFormState } from "@/app/(workspace)/analyzer/actions";

export type ScheduleLineValue = { kind: "INCOME" | "EXPENSE"; category: string; amountAnnualUsd: number };

export type AnalysisFormValues = {
  purchasePriceUsd?: number | null;
  renovationBudgetUsd?: number | null;
  closingCostsUsd?: number | null;
  grossIncomeAnnualUsd?: number | null;
  operatingExpensesUsd?: number | null;
  loanAmountUsd?: number | null;
  interestRatePct?: number | null;
  amortizationYears?: number | null;
  targetLtvPct?: number | null;
  targetLtcPct?: number | null;
  minDscr?: number | null;
  lines?: ScheduleLineValue[];
  analystSummary?: string | null;
};

type ScheduleRow = { kind: "INCOME" | "EXPENSE"; category: string; amount: string };

// Optional line-item schedule. When any income (or expense) lines are present they
// roll up to that total, overriding the single scalar field above. Serialized into a
// hidden field the server action parses — the UI never computes an authoritative
// total itself (UW-6); it just captures inputs.
function ScheduleEditor({ initial }: { initial?: ScheduleLineValue[] }) {
  const [rows, setRows] = useState<ScheduleRow[]>(
    (initial ?? []).map((l) => ({ kind: l.kind, category: l.category, amount: String(l.amountAnnualUsd) })),
  );
  const serialized = JSON.stringify(
    rows
      .map((r) => ({ kind: r.kind, category: r.category.trim(), amountAnnualUsd: Number(r.amount.replace(/[,$\s]/g, "")) }))
      .filter((r) => r.category.length > 0 && Number.isFinite(r.amountAnnualUsd)),
  );
  const add = (kind: "INCOME" | "EXPENSE") => setRows((rs) => [...rs, { kind, category: "", amount: "" }]);
  const update = (i: number, patch: Partial<ScheduleRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const group = (kind: "INCOME" | "EXPENSE", title: string) => (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <button type="button" className="btn-ghost text-xs" onClick={() => add(kind)}>
          + Add line
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {rows.map((r, i) =>
          r.kind === kind ? (
            <div key={i} className="flex items-center gap-2">
              <input className="input flex-1" placeholder="Category" value={r.category} onChange={(e) => update(i, { category: e.target.value })} />
              <input className="input w-36" type="number" min="0" step="any" placeholder="Annual USD" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              <button type="button" className="px-2 text-lg leading-none text-slate-400 hover:text-rose-500" onClick={() => remove(i)} aria-label="Remove line">
                ×
              </button>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );

  return (
    <section className="space-y-4">
      <p className="eyebrow">Income &amp; expense schedule (optional — a schedule overrides the single total above)</p>
      <input type="hidden" name="scheduleJson" value={serialized} />
      <div className="grid gap-6 sm:grid-cols-2">
        {group("INCOME", "Income lines")}
        {group("EXPENSE", "Expense lines")}
      </div>
    </section>
  );
}

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

      <ScheduleEditor initial={values?.lines} />

      <Section title="Debt (optional — enables DSCR & debt yield)">
        <Field label="Loan amount (USD)" name="loanAmountUsd" value={values?.loanAmountUsd} />
        <Field label="Interest rate (%)" name="interestRatePct" value={values?.interestRatePct} step="any" />
        <Field label="Amortization (years)" name="amortizationYears" value={values?.amortizationYears} />
      </Section>

      <Section title="Debt sizing (optional — sizes the loan by LTV / LTC / DSCR)">
        <Field label="Target LTV (%)" name="targetLtvPct" value={values?.targetLtvPct} step="any" hint="Loan ≤ this % of estimated value" />
        <Field label="Target LTC (%)" name="targetLtcPct" value={values?.targetLtcPct} step="any" hint="Loan ≤ this % of all-in cost" />
        <Field label="Min DSCR" name="minDscr" value={values?.minDscr} step="any" hint="Loan sized so NOI ÷ debt service ≥ this" />
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
