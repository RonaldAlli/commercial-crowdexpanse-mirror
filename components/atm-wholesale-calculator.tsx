"use client";

import { useState, type ReactNode } from "react";

import {
  ATM_RULE_OF_THUMB,
  computeAtmWholesaleCalculator,
  type AtmWholesaleCalculatorInputs,
} from "@/lib/atm-wholesale-calculator";

type FormState = {
  propertyAddress: string;
  unitCount: string;
  grossPotentialIncomeUsd: string;
  vacancyLossUsd: string;
  concessionsBadDebtLossToLeaseUsd: string;
  otherIncomeUsd: string;
  realEstateTaxesUsd: string;
  insuranceUsd: string;
  propertyManagementFeesUsd: string;
  repairsMaintenanceUsd: string;
  unitTurnCostsUsd: string;
  utilitiesUsd: string;
  trashUsd: string;
  contractServicesUsd: string;
  generalAdminUsd: string;
  advertisingUsd: string;
  payrollUsd: string;
  areaCapRatePct: string;
  sellerAskingPriceUsd: string;
  downPaymentPct: string;
  acquisitionCostsLoanFeesPct: string;
  mortgageYears: string;
  annualInterestRatePct: string;
  estimatedRepairsUsd: string;
  desiredWholesaleFeeUsd: string;
};

export type AtmWholesaleCalculatorLoadRecord = {
  id: string;
  source: "opportunity" | "property";
  sourceLabel: string;
  propertyName: string;
  propertyAddress: string;
  marketLabel: string;
  sellerName: string | null;
  unitCount: number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  occupancyRatePct: number | null;
  sellerAskingPriceUsd: number | null;
  estimatedValueUsd: number | null;
  areaCapRatePct: number | null;
  annualNetOperatingIncomeUsd: number | null;
};

const DEFAULTS: FormState = {
  propertyAddress: "",
  unitCount: "0",
  grossPotentialIncomeUsd: "0",
  vacancyLossUsd: "0",
  concessionsBadDebtLossToLeaseUsd: "0",
  otherIncomeUsd: "0",
  realEstateTaxesUsd: "0",
  insuranceUsd: "0",
  propertyManagementFeesUsd: "0",
  repairsMaintenanceUsd: "0",
  unitTurnCostsUsd: "0",
  utilitiesUsd: "0",
  trashUsd: "0",
  contractServicesUsd: "0",
  generalAdminUsd: "0",
  advertisingUsd: "0",
  payrollUsd: "0",
  areaCapRatePct: String(ATM_RULE_OF_THUMB.areaCapRatePct),
  sellerAskingPriceUsd: "0",
  downPaymentPct: "25",
  acquisitionCostsLoanFeesPct: "3",
  mortgageYears: String(ATM_RULE_OF_THUMB.mortgageYears),
  annualInterestRatePct: String(ATM_RULE_OF_THUMB.annualInterestRatePct),
  estimatedRepairsUsd: "0",
  desiredWholesaleFeeUsd: "0",
};

const expenseFields: Array<{ key: keyof FormState; label: string; rule: number }> = [
  { key: "realEstateTaxesUsd", label: "Real Estate Taxes", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.realEstateTaxesUsd },
  { key: "insuranceUsd", label: "Insurance", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.insuranceUsd },
  { key: "propertyManagementFeesUsd", label: "Property Management Fees", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.propertyManagementFeesUsd },
  { key: "repairsMaintenanceUsd", label: "Repairs and Maintenance", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.repairsMaintenanceUsd },
  { key: "unitTurnCostsUsd", label: "Unit Turn Costs", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.unitTurnCostsUsd },
  { key: "utilitiesUsd", label: "Utilities", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.utilitiesUsd },
  { key: "trashUsd", label: "Trash", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.trashUsd },
  { key: "contractServicesUsd", label: "Contract Services", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.contractServicesUsd },
  { key: "generalAdminUsd", label: "General/Admin", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.generalAdminUsd },
  { key: "advertisingUsd", label: "Advertising", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.advertisingUsd },
  { key: "payrollUsd", label: "Payroll", rule: ATM_RULE_OF_THUMB.expensesPerUnitUsd.payrollUsd },
];

function parseNumber(value: string) {
  const cleaned = value.replace(/[,$%\s]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usd(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function pct(value: number | null) {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <article className={`rounded-xl border px-4 py-3 ${accent ? "border-brand-200 bg-brand-50/70" : "border-slate-200 bg-slate-50/70"}`}>
      <p className="text-[0.7rem] uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ? "text-brand-700" : "text-slate-900"}`}>{value}</p>
    </article>
  );
}

function FieldBadge({ kind }: { kind: "auto" | "diligence" | "assumption" }) {
  const styles =
    kind === "auto"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : kind === "diligence"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-sky-200 bg-sky-50 text-sky-700";
  const label = kind === "auto" ? "Auto-fill" : kind === "diligence" ? "Due diligence" : "Our assumption";
  return <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${styles}`}>{label}</span>;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  kind,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  kind?: "auto" | "diligence" | "assumption";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex min-h-[2.25rem] items-start justify-between gap-2 text-sm font-medium text-slate-700">
        <span className="pr-2 leading-5">{label}</span>
        {kind ? <FieldBadge kind={kind} /> : null}
      </span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  hint,
  kind,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  kind?: "auto" | "diligence" | "assumption";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex min-h-[2.25rem] items-start justify-between gap-2 text-sm font-medium text-slate-700">
        <span className="pr-2 leading-5">{label}</span>
        {kind ? <FieldBadge kind={kind} /> : null}
      </span>
      <input className="input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function AtmWholesaleCalculator({
  opportunityRecords,
  propertyRecords,
}: {
  opportunityRecords: AtmWholesaleCalculatorLoadRecord[];
  propertyRecords: AtmWholesaleCalculatorLoadRecord[];
}) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [loadedRecord, setLoadedRecord] = useState<AtmWholesaleCalculatorLoadRecord | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showFieldGuide, setShowFieldGuide] = useState(false);
  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function hydrateFromRecord(record: AtmWholesaleCalculatorLoadRecord) {
    setForm({
      ...DEFAULTS,
      propertyAddress: record.propertyAddress || record.propertyName,
      unitCount: record.unitCount != null ? String(record.unitCount) : DEFAULTS.unitCount,
      areaCapRatePct: record.areaCapRatePct != null ? String(record.areaCapRatePct) : DEFAULTS.areaCapRatePct,
      sellerAskingPriceUsd: record.sellerAskingPriceUsd != null ? String(record.sellerAskingPriceUsd) : DEFAULTS.sellerAskingPriceUsd,
    });
    setLoadedRecord(record);
  }

  function loadOpportunity(id: string) {
    setSelectedOpportunityId(id);
    setSelectedPropertyId("");
    const record = opportunityRecords.find((item) => item.id === id);
    if (record) hydrateFromRecord(record);
  }

  function loadProperty(id: string) {
    setSelectedPropertyId(id);
    setSelectedOpportunityId("");
    const record = propertyRecords.find((item) => item.id === id);
    if (record) hydrateFromRecord(record);
  }

  function clearLoadedRecord() {
    setForm(DEFAULTS);
    setLoadedRecord(null);
    setSelectedOpportunityId("");
    setSelectedPropertyId("");
  }

  const inputs: AtmWholesaleCalculatorInputs = {
    propertyAddress: form.propertyAddress.trim(),
    unitCount: parseNumber(form.unitCount),
    grossPotentialIncomeUsd: parseNumber(form.grossPotentialIncomeUsd),
    vacancyLossUsd: parseNumber(form.vacancyLossUsd),
    concessionsBadDebtLossToLeaseUsd: parseNumber(form.concessionsBadDebtLossToLeaseUsd),
    otherIncomeUsd: parseNumber(form.otherIncomeUsd),
    realEstateTaxesUsd: parseNumber(form.realEstateTaxesUsd),
    insuranceUsd: parseNumber(form.insuranceUsd),
    propertyManagementFeesUsd: parseNumber(form.propertyManagementFeesUsd),
    repairsMaintenanceUsd: parseNumber(form.repairsMaintenanceUsd),
    unitTurnCostsUsd: parseNumber(form.unitTurnCostsUsd),
    utilitiesUsd: parseNumber(form.utilitiesUsd),
    trashUsd: parseNumber(form.trashUsd),
    contractServicesUsd: parseNumber(form.contractServicesUsd),
    generalAdminUsd: parseNumber(form.generalAdminUsd),
    advertisingUsd: parseNumber(form.advertisingUsd),
    payrollUsd: parseNumber(form.payrollUsd),
    areaCapRatePct: parseNumber(form.areaCapRatePct),
    sellerAskingPriceUsd: parseNumber(form.sellerAskingPriceUsd),
    downPaymentPct: parseNumber(form.downPaymentPct),
    acquisitionCostsLoanFeesPct: parseNumber(form.acquisitionCostsLoanFeesPct),
    mortgageYears: parseNumber(form.mortgageYears),
    annualInterestRatePct: parseNumber(form.annualInterestRatePct),
    estimatedRepairsUsd: parseNumber(form.estimatedRepairsUsd),
    desiredWholesaleFeeUsd: parseNumber(form.desiredWholesaleFeeUsd),
  };

  const result = computeAtmWholesaleCalculator(inputs);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <Metric label="NOI" value={usd(result.annualNetOperatingIncomeUsd)} accent />
        <Metric label="Initial Property Value" value={usd(result.initialPropertyValueUsd)} accent />
        <Metric label="Cash on Cash Return" value={pct(result.cashOnCashReturnPct)} accent />
        <Metric label="Maximum Allowable Offer" value={usd(result.maximumAllowableOfferUsd)} accent />
      </div>

      <Card title="Load Seller Property in One Click" subtitle="Pull an existing opportunity or property into the calculator. Stored address, units, asking price, and cap rate load automatically. Then fill in the income and expense lines before trusting the offer output.">
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Load from opportunity</span>
            <select className="input" value={selectedOpportunityId} onChange={(e) => loadOpportunity(e.target.value)} disabled={Boolean(selectedPropertyId)}>
              <option value="">Select an opportunity...</option>
              {opportunityRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.sourceLabel}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">
              {selectedPropertyId ? "Clear the property selection to switch sources." : "Best when you already created a deal in the pipeline."}
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Load from property</span>
            <select className="input" value={selectedPropertyId} onChange={(e) => loadProperty(e.target.value)} disabled={Boolean(selectedOpportunityId)}>
              <option value="">Select a property...</option>
              {propertyRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.sourceLabel}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">
              {selectedOpportunityId ? "Clear the opportunity selection to switch sources." : "Best when you want to start from the property record before an opportunity exists."}
            </span>
          </label>
        </div>

        {loadedRecord ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] text-slate-400">Loaded record</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{loadedRecord.propertyName}</p>
                <p className="mt-1 text-sm text-slate-500">{loadedRecord.propertyAddress}</p>
              </div>
              <button type="button" className="btn-ghost self-start" onClick={clearLoadedRecord}>
                Start blank
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Source" value={loadedRecord.source === "opportunity" ? "Opportunity" : "Property"} />
              <Metric label="Seller" value={loadedRecord.sellerName ?? "Unassigned"} />
              <Metric label="Stored Ask" value={usd(loadedRecord.sellerAskingPriceUsd)} />
              <Metric label="Stored NOI" value={usd(loadedRecord.annualNetOperatingIncomeUsd)} />
              <Metric label="Stored Occupancy" value={loadedRecord.occupancyRatePct != null ? `${loadedRecord.occupancyRatePct.toFixed(2)}%` : "—"} />
              <Metric label="Stored Cap Rate" value={pct(loadedRecord.areaCapRatePct)} />
              <Metric label="Units" value={loadedRecord.unitCount != null ? loadedRecord.unitCount.toLocaleString("en-US") : "—"} />
              <Metric label="Square Feet" value={loadedRecord.squareFeet != null ? loadedRecord.squareFeet.toLocaleString("en-US") : "—"} />
              <Metric label="Year Built" value={loadedRecord.yearBuilt != null ? String(loadedRecord.yearBuilt) : "—"} />
              <Metric label="Estimated Value" value={usd(loadedRecord.estimatedValueUsd)} />
              <Metric label="Market" value={loadedRecord.marketLabel || "—"} />
              <Metric label="Loaded Into Form" value="Address, units, ask, cap rate" accent />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Only the fields already stored on the record load automatically. Enter trailing income, vacancy, concessions, and operating expenses before using the MAO as a real offer number.
            </p>
          </div>
        ) : null}
      </Card>

      <section className="card p-6">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={() => setShowInstructions((current) => !current)}
          aria-expanded={showInstructions}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">How to Use This Calculator</h2>
            <p className="mt-1 text-xs text-slate-500">Click to open or close the deal-evaluation instructions.</p>
          </div>
          <span className="text-sm font-medium text-brand-700">{showInstructions ? "Hide" : "Show"}</span>
        </button>

        {showInstructions ? (
          <div className="mt-5 grid gap-6 border-t border-slate-100 pt-5 xl:grid-cols-2">
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-900">1. Fill in the deal setup first.</p>
              <p>Enter the property address, unit count, market cap rate for the area, and the seller&apos;s asking price.</p>
              <p className="font-semibold text-slate-900">2. Enter the income numbers.</p>
              <p>Start with gross potential income, then subtract vacancy and concessions, and add any other income so the calculator can estimate operating income correctly.</p>
              <p className="font-semibold text-slate-900">3. Enter the operating expenses.</p>
              <p>Use trailing-12 expenses when you have them. If you do not, use the rule-of-thumb numbers and then tighten them up during due diligence.</p>
              <p className="font-semibold text-slate-900">4. Add financing, repairs, and your fee.</p>
              <p>Use realistic down payment, loan fee, interest rate, and term assumptions. Then enter estimated repairs and the wholesale fee you want to make.</p>
            </div>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-900">How to judge the deal</p>
              <p>
                Watch <span className="font-medium text-slate-900">NOI</span>, <span className="font-medium text-slate-900">Initial Property Value</span>, and{" "}
                <span className="font-medium text-slate-900">Maximum Allowable Offer</span> first.
              </p>
              <p>
                If the <span className="font-medium text-slate-900">seller&apos;s asking price</span> is below or near the{" "}
                <span className="font-medium text-slate-900">Maximum Allowable Offer</span>, the deal may have room for a wholesale spread.
              </p>
              <p>
                If the <span className="font-medium text-slate-900">asking price</span> is well above the{" "}
                <span className="font-medium text-slate-900">Maximum Allowable Offer</span>, the deal likely needs a lower offer or should be passed on.
              </p>
              <p>
                The <span className="font-medium text-slate-900">Seller&apos;s Capitalization Rate</span> helps you compare what the seller wants versus what the market usually pays.
              </p>
              <p>
                The <span className="font-medium text-slate-900">Cash on Cash Return</span> and cash-flow section help you see whether an end buyer could still want the deal after debt service.
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                Quick rule: good wholesale candidates usually have a clear spread between market value and your offer after repairs, fees, and buyer profit are all accounted for.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card p-6">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={() => setShowFieldGuide((current) => !current)}
          aria-expanded={showFieldGuide}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Field Guide</h2>
            <p className="mt-1 text-xs text-slate-500">Click to open or close the badge legend for auto-fill, due diligence, and underwriting assumptions.</p>
          </div>
          <span className="text-sm font-medium text-brand-700">{showFieldGuide ? "Hide" : "Show"}</span>
        </button>

        {showFieldGuide ? (
          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <FieldBadge kind="auto" />
              <p className="mt-2 text-sm font-medium text-slate-900">Auto-fill from property data</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">These should come from the property or opportunity record whenever we already have them from lead intake or Deal Automator.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <FieldBadge kind="diligence" />
              <p className="mt-2 text-sm font-medium text-slate-900">Usually verified in due diligence</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">These numbers are best pulled from T12s, rent rolls, OM packages, seller documents, and walkthroughs before we trust the final MAO.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <FieldBadge kind="assumption" />
              <p className="mt-2 text-sm font-medium text-slate-900">Our underwriting assumption</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">These are our financing or business assumptions and can change based on buyer profile, lending terms, and strategy.</p>
            </div>
          </div>
        ) : null}
      </section>

      <Card title="Deal Setup" subtitle="Workbook parity: same sections and formulas as the ATM wholesale calculator.">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <TextInput label="Property address" value={form.propertyAddress} onChange={(value) => update("propertyAddress", value)} placeholder="[Insert Property Address]" kind="auto" />
          <NumberInput label="Number of units" value={form.unitCount} onChange={(value) => update("unitCount", value)} kind="auto" />
          <NumberInput label="Area capitalization rate (%)" value={form.areaCapRatePct} onChange={(value) => update("areaCapRatePct", value)} hint={`Rule of thumb: ${ATM_RULE_OF_THUMB.areaCapRatePct}%`} kind="auto" />
          <NumberInput label="Seller's asking price ($)" value={form.sellerAskingPriceUsd} onChange={(value) => update("sellerAskingPriceUsd", value)} kind="auto" />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Annual Operating Income" subtitle="Use the last 3 months (T-3) as the workbook instructs.">
          <div className="grid gap-5 md:grid-cols-2">
            <NumberInput label="Gross Potential Income ($)" value={form.grossPotentialIncomeUsd} onChange={(value) => update("grossPotentialIncomeUsd", value)} kind="diligence" />
            <NumberInput label="Vacancy loss ($)" value={form.vacancyLossUsd} onChange={(value) => update("vacancyLossUsd", value)} hint={`Workbook rule of thumb: ${ATM_RULE_OF_THUMB.vacancyRatePct}%`} kind="diligence" />
            <NumberInput
              label="Concessions / bad debt / loss to lease ($)"
              value={form.concessionsBadDebtLossToLeaseUsd}
              onChange={(value) => update("concessionsBadDebtLossToLeaseUsd", value)}
              hint={`Workbook rule of thumb: ${ATM_RULE_OF_THUMB.concessionsRatePct}%`}
              kind="diligence"
            />
            <NumberInput label="Other income ($)" value={form.otherIncomeUsd} onChange={(value) => update("otherIncomeUsd", value)} kind="diligence" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Vacancy %" value={pct(result.vacancyRatePct)} />
            <Metric label="Concessions %" value={pct(result.concessionsRatePct)} />
            <Metric label="Gross Operating Income" value={usd(result.grossOperatingIncomeUsd)} />
          </div>
        </Card>

        <Card title="Annual Operating Expenses" subtitle="Use the last 12 months (T-12). Replacement reserve auto-follows the workbook at $300 × units.">
          <div className="grid gap-4 md:grid-cols-2">
            {expenseFields.map((field) => (
              <NumberInput
                key={field.key}
                label={`${field.label} ($)`}
                value={form[field.key]}
                onChange={(value) => update(field.key, value)}
                hint={`Rule of thumb: $${field.rule.toLocaleString("en-US")} / unit`}
                kind="diligence"
              />
            ))}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Replacement Reserve ($)</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{usd(result.replacementReserveUsd)}</p>
              <p className="mt-1 text-xs text-slate-400">Auto-calculated as $300 × units, matching the workbook.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric label="Annual Operating Expenses" value={usd(result.annualOperatingExpensesUsd)} />
            <Metric label="Expenses / Unit" value={usd(result.annualOperatingExpensesPerUnitUsd)} />
            <Metric label="Expense Ratio" value={pct(result.expenseRatioPct)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Capitalization Rate and Valuation">
          <div className="grid gap-5 md:grid-cols-2">
            <Metric label="Total Annual Operating Income" value={usd(result.grossOperatingIncomeUsd)} />
            <Metric label="Total Annual Operating Expense" value={usd(result.annualOperatingExpensesUsd)} />
            <Metric label="Annual Net Operating Income" value={usd(result.annualNetOperatingIncomeUsd)} accent />
            <Metric label="Seller's Capitalization Rate" value={pct(result.sellerCapRatePct)} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Metric label="Initial Property Value" value={usd(result.initialPropertyValueUsd)} accent />
            <Metric label="Area Cap Rate" value={pct(inputs.areaCapRatePct)} />
          </div>
        </Card>

        <Card title="Loan Information">
          <div className="grid gap-5 md:grid-cols-2">
            <NumberInput label="Down payment (%)" value={form.downPaymentPct} onChange={(value) => update("downPaymentPct", value)} hint={`Rule of thumb: ${ATM_RULE_OF_THUMB.downPaymentPctRange}`} kind="assumption" />
            <NumberInput
              label="Acquisition costs and loan fees (%)"
              value={form.acquisitionCostsLoanFeesPct}
              onChange={(value) => update("acquisitionCostsLoanFeesPct", value)}
              hint={`Rule of thumb: ${ATM_RULE_OF_THUMB.acquisitionCostsLoanFeesPctRange}`}
              kind="assumption"
            />
            <NumberInput label="Length of mortgage (years)" value={form.mortgageYears} onChange={(value) => update("mortgageYears", value)} hint={`Rule of thumb: ${ATM_RULE_OF_THUMB.mortgageYears}`} kind="assumption" />
            <NumberInput label="Annual interest rate (%)" value={form.annualInterestRatePct} onChange={(value) => update("annualInterestRatePct", value)} hint={`Rule of thumb: ${ATM_RULE_OF_THUMB.annualInterestRatePct}%`} kind="assumption" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Down Payment $" value={usd(result.downPaymentUsd)} />
            <Metric label="Loan Amount" value={usd(result.loanAmountUsd)} />
            <Metric label="Acq. Costs & Fees" value={usd(result.acquisitionCostsLoanFeesUsd)} />
            <Metric label="Initial Investment" value={usd(result.initialInvestmentUsd)} accent />
            <Metric label="Monthly PI" value={usd(result.estimatedMonthlyMortgagePaymentUsd)} />
            <Metric label="Annual Interest" value={usd(result.annualInterestUsd)} />
            <Metric label="Annual Principal" value={usd(result.annualPrincipalUsd)} />
            <Metric label="Annual Debt Service" value={usd(result.annualDebtServiceUsd)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Cash Flow and ROI" subtitle="The monthly cash-flow figure intentionally mirrors the workbook formula exactly.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Monthly Cash Flow (before taxes)" value={usd(result.totalMonthlyCashFlowBeforeTaxesUsd)} />
            <Metric label="Annual Cash Flow (before taxes)" value={usd(result.totalAnnualCashFlowBeforeTaxesUsd)} />
            <Metric label="Cash on Cash Return" value={pct(result.cashOnCashReturnPct)} accent />
          </div>
        </Card>

        <Card title="ATM Multifamily Buy Formula">
          <div className="grid gap-5 md:grid-cols-2">
            <NumberInput label="Estimated Repairs ($)" value={form.estimatedRepairsUsd} onChange={(value) => update("estimatedRepairsUsd", value)} kind="diligence" />
            <NumberInput label="Desired Wholesale Fee ($)" value={form.desiredWholesaleFeeUsd} onChange={(value) => update("desiredWholesaleFeeUsd", value)} kind="assumption" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Gross Annual Income" value={usd(result.grossOperatingIncomeUsd)} />
            <Metric label="Gross Annual Expense" value={usd(result.annualOperatingExpensesUsd)} />
            <Metric label="Proforma Value" value={usd(result.initialPropertyValueUsd)} />
            <Metric label="Buy & Hold Buy Price" value={usd(result.buyHoldBuyPriceUsd)} />
            <Metric label="NOI" value={usd(result.annualNetOperatingIncomeUsd)} />
            <Metric label="Area Cap Rate" value={pct(inputs.areaCapRatePct)} />
            <Metric label="Desired Wholesale Fee" value={usd(inputs.desiredWholesaleFeeUsd)} />
            <Metric label="Maximum Allowable Offer" value={usd(result.maximumAllowableOfferUsd)} accent />
          </div>
        </Card>
      </div>
    </div>
  );
}
