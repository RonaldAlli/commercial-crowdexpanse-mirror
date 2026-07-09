import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { resolveNoteLink } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

import { deleteNote } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();

  const notes = await prisma.note.findMany({
    where: { organizationId: user.organizationId },
    include: {
      author: { select: { name: true } },
      seller: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
      property: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Notes"
        description="Context and observations linked to sellers, buyers, properties, and deals."
        actions={
          <Link className="btn-primary" href="/notes/new">
            New note
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </Link>
        }
      />

      {notes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {notes.map((note) => {
            const link = resolveNoteLink(note);
            const deleteNoteBound = deleteNote.bind(null, note.id);
            return (
              <article key={note.id} className="card flex flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  {link ? (
                    <Link href={link.href}>
                      <Badge tone="brand">
                        {link.label}: {link.name}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge tone="neutral">Unlinked</Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <Link href={`/notes/${note.id}/edit`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                      Edit
                    </Link>
                    <form action={deleteNoteBound}>
                      <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-3 flex-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{note.body}</p>
                <p className="mt-3 text-xs text-slate-400">
                  {note.author?.name ?? "Unknown"} ·{" "}
                  {note.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="notes"
            title="No notes yet"
            description="Capture context against a seller, buyer, property, or opportunity."
            action={
              <Link className="btn-primary" href="/notes/new">
                New note
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
