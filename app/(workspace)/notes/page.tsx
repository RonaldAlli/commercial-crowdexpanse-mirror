import { PageHeader } from "@/components/page-header";
import { notes } from "@/lib/demo-data";

export default function NotesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notes"
        title="Notes"
        description="Context capture for negotiations, underwriting, and buyer pull."
        actions={<button className="btn-primary">New note</button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {notes.map((note) => (
          <article key={note.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">{note.topic}</h2>
                <p className="mt-0.5 truncate text-xs text-brand-600">{note.linkedDeal}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{note.time}</span>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{note.body}</p>
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[0.6rem] font-semibold text-white">
                {note.author
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
              <span className="text-xs font-medium text-slate-600">{note.author}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
