"use client";

import { useRef } from "react";

export function StageSelect({
  action,
  current,
  stages,
  className = "",
}: {
  action: (formData: FormData) => Promise<void>;
  current: string;
  stages: { value: string; label: string }[];
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form ref={ref} action={action}>
      <select
        name="stage"
        defaultValue={current}
        onChange={() => ref.current?.requestSubmit()}
        className={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 ${className}`}
      >
        {stages.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}
