import { UserRole } from "@prisma/client";

import { LeadImportForm } from "@/components/lead-import-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getLeadImportCounts, listLeadImportJobs } from "@/lib/lead-import-jobs";

export const dynamic = "force-dynamic";

function formatStatusTone(status: string): "info" | "success" | "danger" | "neutral" {
  if (status === "running") return "info";
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export default async function ImportSettingsPage() {
  const user = await requireRole(UserRole.ADMIN);
  const [counts, jobs] = await Promise.all([
    getLeadImportCounts(user.organizationId),
    listLeadImportJobs(user.organizationId, 12),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Imports"
        description="Queue commercial lead imports, run dry validations, and review recent import job results."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Owners", value: counts.owners },
          { label: "Properties", value: counts.properties },
          { label: "Opportunities", value: counts.opportunities },
          { label: "Notes", value: counts.notes },
          { label: "External IDs", value: counts.externalIds },
        ].map((item) => (
          <article key={item.label} className="card p-5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value.toLocaleString("en-US")}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">Queue a lead import</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">
            Upload a lead batch directly here, or point the importer at a file that already exists on the server.
          </p>
          <LeadImportForm
            defaults={{
              sourceFile: "/tmp/commercial-leads-2026-07-16.json",
              actorEmail: user.email,
              provider: "dealautomator.com/commercial-lead",
            }}
          />
        </section>

        <section className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">Import options</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-900">Dry run</p>
              <p className="mt-1 text-xs text-slate-500">
                Validates dedupe and parsing with zero writes. Best for new file checks.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-900">Direct upload</p>
              <p className="mt-1 text-xs text-slate-500">
                Choose a JSON, CSV, TSV/TXT, XLSX, or XLS file in the browser and the app stores it in workspace uploads before queuing the background import.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-900">Limit</p>
              <p className="mt-1 text-xs text-slate-500">
                Runs a small first slice like <code>25</code> or <code>100</code> before a full production batch.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-900">Provider key</p>
              <p className="mt-1 text-xs text-slate-500">
                Controls the idempotent external identifier namespace used to prevent duplicate property imports.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="font-medium text-slate-900">Actor email</p>
              <p className="mt-1 text-xs text-slate-500">
                Attributes created notes and activity rows to a real operator inside this organization.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Recent import jobs</h2>
          <p className="text-xs text-slate-500">Newest first. Refresh the page to update background job status.</p>
        </div>

        {jobs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500">No import jobs have been queued yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50/60">
                <tr>
                  <th className="table-head">Status</th>
                  <th className="table-head">Created</th>
                  <th className="table-head">Source file</th>
                  <th className="table-head">Mode</th>
                  <th className="table-head">Attempted</th>
                  <th className="table-head">Created rows</th>
                  <th className="table-head">Skipped</th>
                  <th className="table-head">Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job) => {
                  const summary = job.summary ?? null;
                  return (
                    <tr key={job.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="table-cell">
                        <div className="flex flex-col gap-1">
                          <Badge tone={formatStatusTone(job.status)}>
                            {job.status === "queued"
                              ? "Queued"
                              : job.status === "running"
                                ? "Running"
                                : job.status === "succeeded"
                                  ? "Succeeded"
                                  : "Failed"}
                          </Badge>
                          {job.error ? <span className="max-w-[260px] truncate text-xs text-rose-600">{job.error}</span> : null}
                        </div>
                      </td>
                      <td className="table-cell whitespace-nowrap text-slate-500">
                        {new Date(job.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="table-cell">
                        <div className="max-w-[320px] truncate font-mono text-xs text-slate-600">{job.sourceName}</div>
                        <div className="mt-1 text-xs text-slate-400">{job.id}</div>
                      </td>
                      <td className="table-cell">
                        <div className="text-sm text-slate-700">{job.dryRun ? "Dry run" : "Live import"}</div>
                        <div className="text-xs text-slate-400">{job.limit ? `Limit ${job.limit}` : "Full file"}</div>
                      </td>
                      <td className="table-cell metric">{summary ? summary.attempted.toLocaleString("en-US") : "—"}</td>
                      <td className="table-cell metric">
                        {summary
                          ? (
                            summary.ownersCreated +
                            summary.propertiesCreated +
                            summary.opportunitiesCreated +
                            summary.notesCreated
                          ).toLocaleString("en-US")
                          : "—"}
                      </td>
                      <td className="table-cell metric">{summary ? summary.skipped.toLocaleString("en-US") : "—"}</td>
                      <td className="table-cell">
                        <code className="text-xs text-slate-500">{job.exitCode === null || job.exitCode === undefined ? "—" : `exit ${job.exitCode}`}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
