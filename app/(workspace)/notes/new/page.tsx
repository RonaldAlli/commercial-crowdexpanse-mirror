import { PageHeader } from "@/components/page-header";
import { NoteForm } from "@/components/note-form";
import { requireUser } from "@/lib/auth";
import { NOTE_LINK_META, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";

import { createNote } from "../actions";

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

export default async function NewNotePage({ searchParams }: { searchParams: { type?: string; id?: string } }) {
  const user = await requireUser();
  const records = await loadRecords(user.organizationId);

  const type = (searchParams.type ?? "") as NoteLinkType;
  const prefillType = NOTE_LINK_META[type] ? type : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Workflow" title="New note" description="Capture context against a seller, buyer, property, or opportunity." />
      <div className="card p-6">
        <NoteForm
          action={createNote}
          records={records}
          values={prefillType ? { linkType: prefillType, linkId: searchParams.id ?? "" } : undefined}
          submitLabel="Create note"
          cancelHref="/notes"
        />
      </div>
    </div>
  );
}
