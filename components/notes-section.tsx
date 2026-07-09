import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { NOTE_LINK_META, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

/** Surfaces the notes attached to one record on its detail page. Read-only + Add link. */
export async function NotesSection({ organizationId, type, id }: { organizationId: string; type: NoteLinkType; id: string }) {
  const field = NOTE_LINK_META[type].field;

  const notes = await prisma.note.findMany({
    where: { organizationId, [field]: id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <article className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Notes</h2>
        <Link href={`/notes/new?type=${type}&id=${id}`} className="text-sm font-medium text-brand-700 hover:underline">
          Add note
        </Link>
      </div>
      {notes.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {notes.map((note) => (
            <li key={note.id} className="px-5 py-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{note.body}</p>
              <p className="mt-1.5 text-xs text-slate-400">
                {note.author?.name ?? "Unknown"} ·{" "}
                {note.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="notes" title="No notes yet" />
      )}
    </article>
  );
}
