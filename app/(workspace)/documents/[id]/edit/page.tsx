import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { DocumentForm } from "@/components/document-form";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/document-options";
import { resolveNoteLink, type NoteLinkType } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/storage";

import { deleteDocument, updateDocument } from "../../actions";

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

export default async function EditDocumentPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const document = await prisma.document.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: {
      seller: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } },
      property: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  if (!document) {
    notFound();
  }

  const records = await loadRecords(user.organizationId);
  const link = resolveNoteLink(document);
  const linkId = document.sellerId ?? document.buyerId ?? document.propertyId ?? document.opportunityId ?? "";
  const deleteDocumentBound = deleteDocument.bind(null, document.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Edit document"
        description={`${document.originalFilename ?? "file"} · ${formatBytes(document.fileSizeBytes)} · the file itself cannot be changed here`}
        actions={
          <form action={deleteDocumentBound}>
            <button type="submit" className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
              Delete
            </button>
          </form>
        }
      />
      <div className="card p-6">
        <DocumentForm
          action={updateDocument.bind(null, document.id)}
          records={records}
          documentTypes={DOCUMENT_TYPE_OPTIONS}
          values={{ title: document.title, documentType: document.documentType, linkType: link?.type ?? "opportunity", linkId }}
          withFile={false}
          submitLabel="Save changes"
          cancelHref="/documents"
        />
      </div>
      <p className="text-center text-sm text-slate-400">
        <Link href="/documents" className="hover:text-slate-600">
          ← Back to documents
        </Link>
      </p>
    </div>
  );
}
