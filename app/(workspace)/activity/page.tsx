import { PageHeader } from "@/components/page-header";
import { activity } from "@/lib/demo-data";

const dot = {
  positive: "bg-emerald-500 ring-emerald-50",
  info: "bg-brand-500 ring-brand-50",
  alert: "bg-amber-500 ring-amber-50",
} as const;

export default function ActivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity timeline"
        title="Activity"
        description="Operational movement across sellers, deals, buyers, and documents."
      />

      <div className="card p-6">
        <ol className="relative">
          {activity.map((entry, i) => (
            <li key={entry.id} className="flex gap-4 pb-6 last:pb-0">
              <div className="flex flex-col items-center">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ${dot[entry.tone]}`} />
                {i < activity.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-slate-200" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                  <span className="text-xs text-slate-400">{entry.time}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{entry.body}</p>
                <p className="mt-1.5 text-xs text-slate-400">{entry.actor}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
