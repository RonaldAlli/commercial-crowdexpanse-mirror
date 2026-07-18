"use client";

import { useState, useTransition } from "react";

import { startLeadImportAction } from "@/app/(workspace)/settings/imports/actions";

export function LeadImportForm({
  defaults,
}: {
  defaults: {
    sourceFile: string;
    actorEmail: string;
    provider: string;
  };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queuedSourceFile, setQueuedSourceFile] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        setError(null);
        setSuccess(null);
        setJobId(null);
        setQueuedSourceFile(null);
        start(async () => {
          const result = await startLeadImportAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setSuccess(result?.success ?? "Import job queued.");
          setJobId(result?.jobId ?? null);
          setQueuedSourceFile(result?.sourceName ?? null);
        });
      }}
    >
      <div>
        <label className="text-xs font-medium text-slate-500" htmlFor="import-lead-file">
          Upload lead file from this computer
        </label>
        <input
          id="import-lead-file"
          name="leadFile"
          type="file"
          accept=".json,.csv,.tsv,.txt,.xlsx,.xls,application/json,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="mt-1 block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        />
        <p className="mt-1 text-xs text-slate-400">
          Supported: JSON, CSV, TSV/TXT, XLSX, and XLS. If you pick a file here, it overrides the server path field below.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500" htmlFor="import-source-file">
          Source file on server
        </label>
        <input
          id="import-source-file"
          name="sourceFile"
          defaultValue={defaults.sourceFile}
          className="input mt-1 h-10 text-sm"
          placeholder="/tmp/commercial-leads-2026-07-16.json"
        />
        <p className="mt-1 text-xs text-slate-400">
          Optional if you upload a file above. Allowed roots: <code>/tmp</code>, <code>uploads</code>, or <code>imports</code> inside the app directory.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500" htmlFor="import-actor-email">
            Import actor email
          </label>
          <input
            id="import-actor-email"
            name="actorEmail"
            type="email"
            defaultValue={defaults.actorEmail}
            required
            className="input mt-1 h-10 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500" htmlFor="import-provider">
            Provider key
          </label>
          <input
            id="import-provider"
            name="provider"
            defaultValue={defaults.provider}
            required
            className="input mt-1 h-10 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="text-xs font-medium text-slate-500" htmlFor="import-limit">
            Record limit
          </label>
          <input
            id="import-limit"
            name="limit"
            type="number"
            min="1"
            className="input mt-1 h-10 text-sm"
            placeholder="Optional"
          />
          <p className="mt-1 text-xs text-slate-400">Leave blank for the full file.</p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <input name="dryRun" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span>
            <span className="block text-sm font-medium text-slate-900">Dry run only</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Validate parsing and dedupe without writing owners, properties, opportunities, or notes.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Large imports run in the background. Refresh this page to watch the recent jobs table update.
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Queueing…" : "Queue import"}
        </button>
        {success ? <span className="text-xs font-medium text-emerald-600">{success}</span> : null}
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>

      {jobId ? (
        <div className="space-y-1 text-xs text-slate-500">
          <p>
            Job ID: <code>{jobId}</code>
          </p>
          {queuedSourceFile ? (
            <p>
              Source file queued: <code>{queuedSourceFile}</code>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
