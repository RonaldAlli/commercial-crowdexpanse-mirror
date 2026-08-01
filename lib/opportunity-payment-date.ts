// Forecasting Backend Authority G-2 — pure Expected Payment Date resolution (no I/O). Per FD-2: the expected
// payment date is DERIVED from targetCloseDate by default, and an explicit value (set via the service) OVERRIDES
// and is then owned rather than re-derived. This resolver is the single place that expresses that rule; the
// forecasting time-phasing (a later increment) reads through it.

export type PaymentDateSource = "explicit" | "derived" | "none";
export type ExpectedPaymentDateView = { effective: Date | null; source: PaymentDateSource };

export function effectiveExpectedPaymentDate(input: {
  expectedPaymentDate: Date | null;
  targetCloseDate: Date | null;
}): ExpectedPaymentDateView {
  if (input.expectedPaymentDate != null) return { effective: input.expectedPaymentDate, source: "explicit" };
  if (input.targetCloseDate != null) return { effective: input.targetCloseDate, source: "derived" };
  return { effective: null, source: "none" };
}
