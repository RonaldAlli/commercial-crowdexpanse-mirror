import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { documentTypeLabel } from "@/lib/document-options";
import { resolveNoteLink } from "@/lib/note-links";
import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/storage";

import { deleteDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();

  const documents = await prisma.document.findMany({
    where: { organizationId: user.organizationId },
    include: {
      uploader: { select: { name: true } },
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
        title="Documents"
        description="Files stored on disk and linked to sellers, buyers, properties, and deals."
        actions={
          <Link className="btn-primary" href="/documents/new">
            Upload document
            <Icon name="upload" className="h-4 w-4" />
          </Link>
        }
      />

      {documents.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Document</th>
                  <th className="table-head">Type</th>
                  <th className="table-head">Linked to</th>
                  <th className="table-head text-right">Size</th>
                  <th className="table-head">Uploaded by</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => {
                  const link = resolveNoteLink(doc);
                  const deleteDocumentBound = deleteDocument.bind(null, doc.id);
                  return (
                    <tr key={doc.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <a href={`/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 hover:text-brand-700">
                          {doc.title}
                        </a>
                        {doc.originalFilename && doc.originalFilename !== doc.title ? (
                          <p className="text-xs text-slate-500">{doc.originalFilename}</p>
                        ) : null}
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <Badge tone="neutral">{documentTypeLabel(doc.documentType)}</Badge>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        {link ? (
                          <Link href={link.href} className="text-brand-700 hover:underline">
                            {link.label}: {link.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="table-cell metric whitespace-nowrap text-right text-slate-600">{formatBytes(doc.fileSizeBytes)}</td>
                      <td className="table-cell whitespace-nowrap text-slate-600">{doc.uploader?.name ?? "—"}</td>
                      <td className="table-cell whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/documents/${doc.id}/download?download=1`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                            Download
                          </a>
                          <Link href={`/documents/${doc.id}/edit`} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                            Edit
                          </Link>
                          <form action={deleteDocumentBound}>
                            <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="files"
            title="No documents yet"
            description="Upload T12s, rent rolls, LOIs, and contracts, linked to a record."
            action={
              <Link className="btn-primary" href="/documents/new">
                Upload document
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
