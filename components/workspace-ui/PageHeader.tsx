// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — a consistent page title region with a single semantic <h1>, an optional context line,
//     and an actions slot; the heading is the labelling anchor for the page.
//   does NOT — fetch data or decide what the title should be.
//   later increments supply — real page content and titles per screen.

export function PageHeader({
  title,
  description,
  actions,
  titleId = "page-title",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  titleId?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 id={titleId} className="truncate text-xl font-semibold text-slate-900">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
