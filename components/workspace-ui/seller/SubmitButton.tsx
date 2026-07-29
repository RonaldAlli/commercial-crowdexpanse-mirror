"use client";

// CRE Operating Workspace — UI M1 Increment 2.
//
// Contract:
//   guarantees — a submit control with an accessible name and a PENDING state (aria-busy + disabled)
//     while its enclosing <form> action runs; progressive-enhancement only.
//   does NOT — define, wrap, or change any server action; success/refresh is driven by the action's own
//     revalidate/redirect, not by this button.
//   later increments supply — richer inline success/error surfaces if the underlying actions evolve to
//     return structured results.

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}
