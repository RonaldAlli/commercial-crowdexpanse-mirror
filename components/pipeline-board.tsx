import { Badge } from "@/components/ui/badge";
import { pipelineBoard } from "@/lib/demo-data";

export function PipelineBoard() {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex gap-4">
        {pipelineBoard.map((column) => (
          <section key={column.stage} className="flex w-[280px] shrink-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-0.5">
              <h3 className="text-sm font-semibold text-slate-700">{column.stage}</h3>
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-500">
                {column.items.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3">
              {column.items.length ? (
                column.items.map((item) => (
                  <article
                    key={item.id}
                    className="card cursor-pointer p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                        {item.market}
                      </p>
                      <Badge tone="neutral">{item.assetType}</Badge>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold leading-snug text-slate-900">
                      {item.name}
                    </h4>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                      <span className="metric text-slate-500">{item.basis}</span>
                      <span className="metric font-medium text-emerald-600">{item.spread}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">{item.nextStep}</p>
                  </article>
                ))
              ) : (
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                  No deals
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
