import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { Badge, statusTone } from "@/components/ui/badge";
import { files } from "@/lib/demo-data";

const requiredDocuments = [
  "T12 / trailing financials",
  "Current rent roll",
  "Insurance loss runs",
  "Service contracts",
  "Trailing utility detail",
  "Draft LOI / PSA package",
];

export default function FilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document center"
        title="Document center"
        description="File intake and acquisition diligence readiness."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <label className="card group flex cursor-pointer flex-col items-center gap-2 border-dashed p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
              <Icon name="upload" className="h-5 w-5" />
            </span>
            <span className="mt-1 text-sm font-semibold text-slate-900">
              Drop diligence files here
            </span>
            <span className="max-w-sm text-xs text-slate-500">
              MVP includes the upload surface and document model. Object storage wiring lands in the
              next pass.
            </span>
            <input type="file" multiple className="hidden" />
          </label>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Uploaded files</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50/60">
                  <tr>
                    <th className="table-head">File</th>
                    <th className="table-head">Type</th>
                    <th className="table-head">Linked deal</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Uploaded by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map((file) => (
                    <tr key={file.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          <Icon name="files" className="h-4 w-4 shrink-0 text-slate-400" />
                          {file.name}
                        </span>
                      </td>
                      <td className="table-cell whitespace-nowrap">
                        <Badge tone="neutral">{file.type}</Badge>
                      </td>
                      <td className="table-cell text-slate-600">{file.linkedDeal}</td>
                      <td className="table-cell whitespace-nowrap">
                        <Badge tone={statusTone(file.status)}>{file.status}</Badge>
                      </td>
                      <td className="table-cell whitespace-nowrap text-slate-600">
                        {file.uploadedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <article className="card h-fit">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="eyebrow">Required diligence stack</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              Standard acquisition packet
            </h2>
          </div>
          <ul className="space-y-3 p-5">
            {requiredDocuments.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                <p className="text-sm text-slate-600">{item}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
