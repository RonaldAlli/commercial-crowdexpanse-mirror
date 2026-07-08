import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneStyles[tone]}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

export type { Tone };

/** Maps common domain strings to a semantic badge tone. */
export function statusTone(value: string): Tone {
  const v = value.toLowerCase();
  if (["complete", "reviewed", "paid", "closed"].some((k) => v.includes(k))) return "success";
  if (["blocked", "missing", "overdue", "risk"].some((k) => v.includes(k))) return "danger";
  if (["pending", "requested", "review", "backlog", "outstanding"].some((k) => v.includes(k)))
    return "warning";
  if (["in progress", "underwriting", "active", "matched"].some((k) => v.includes(k)))
    return "info";
  return "neutral";
}
