// CRE Operating Workspace — UI Milestone 1, Increment 1.
//
// Contract:
//   guarantees — a labelled content region (<section aria-labelledby>) with a heading and a consistent
//     main area plus an optional secondary panel; heading level is configurable to preserve document
//     outline order.
//   does NOT — fetch data or lay out any specific screen.
//   later increments supply — the actual sections (queue, record, opportunity) and their contents.

let seq = 0;
function useSectionId(explicit?: string) {
  // Deterministic-per-render id when none supplied; callers should pass a stable id in real screens.
  if (explicit) return explicit;
  seq += 1;
  return `workspace-section-${seq}`;
}

export function WorkspaceSection({
  title,
  headingLevel = 2,
  id,
  actions,
  secondary,
  children,
  className = "",
}: {
  title: string;
  headingLevel?: 2 | 3 | 4;
  id?: string;
  actions?: React.ReactNode;
  /** Optional secondary panel rendered alongside the main area on wide viewports. */
  secondary?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = useSectionId(id);
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <section aria-labelledby={headingId} className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <Heading id={headingId} className="text-sm font-semibold text-slate-900">
          {title}
        </Heading>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={secondary ? "grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem]" : "p-4"}>
        <div className="min-w-0">{children}</div>
        {secondary ? <aside className="min-w-0">{secondary}</aside> : null}
      </div>
    </section>
  );
}
