import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { NoteForm } from "@/components/note-form";
import { requireUser } from "@/lib/auth";
import { resolveNoteLink, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

import { deleteNote, updateNote } from "../../actions";

export const dynamic = "force-dynamic";

async function loadRecords(organizationId: string): Promise<Record<NoteLinkType, { value: string; label: string }[]>> {
  const [sellers, buyers, properties, opportunities] = await Promise.all([
    prisma.seller.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.buyer.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.property.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.opportunity.findMany({ where: { organizationId }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return {
    seller: sellers.map((s) => ({ value: s.id, label: s.name })),
    buyer: buyers.map((b) => ({ value: b.id, label: b.name })),
    property: properties.map((p) => ({ value: p.id, label: p.name })),
    opportunity: opportunities.map((o) => ({ value: o.id, label: o.title })),
  };
}

export default async function EditNotePage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const note = await prisma.note.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      seller: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
      property: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  if (!note) {
    notFound();
  }

  const records = await loadRecords(user.organizationId);
  const link = resolveNoteLink(note);
  const linkId = note.sellerId ?? note.buyerId ?? note.propertyId ?? note.opportunityId ?? "";
  const deleteNoteBound = deleteNote.bind(null, note.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Edit note"
        actions={
          <form action={deleteNoteBound}>
            <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
              Delete
            </button>
          </form>
        }
      />
      <div className="card p-6">
        <NoteForm
          action={updateNote.bind(null, note.id)}
          records={records}
          values={{ body: note.body, linkType: link?.type ?? "seller", linkId }}
          submitLabel="Save changes"
          cancelHref="/notes"
        />
      </div>
      <p className="text-center text-sm text-slate-400">
        <Link href="/notes" className="hover:text-slate-600">
          ← Back to notes
        </Link>
      </p>
    </div>
  );
}
