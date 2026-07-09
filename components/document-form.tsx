"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { DocumentFormState } from "@/app/(workspace)/documents/actions";
import { NOTE_LINK_META, NOTE_LINK_TYPES, type NoteLinkType } from "@/lib/note-links";

type Option = { value: string; label: string };

export type DocumentFormValues = {
  title?: string | null;
  documentType?: string | null;
  linkType?: NoteLinkType;
  linkId?: string | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DocumentForm({
  action,
  values,
  records,
  documentTypes,
  withFile,
  submitLabel,
  cancelHref,
}: {
  action: (state: DocumentFormState, formData: FormData) => Promise<DocumentFormState>;
  values?: DocumentFormValues;
  records: Record<NoteLinkType, Option[]>;
  documentTypes: Option[];
  withFile: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const [linkType, setLinkType] = useState<NoteLinkType>(values?.linkType ?? "opportunity");

  const meta = NOTE_LINK_META[linkType];
  const options = records[linkType];
  const selectedId = values?.linkType === linkType ? values?.linkId ?? "" : "";

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      {withFile ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            File<span className="text-rose-500"> *</span>
          </span>
          <input className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700" name="file" type="file" required />
          <span className="mt-1 block text-xs text-slate-400">Up to 25MB. Stored on disk; only metadata is saved to the database.</span>
        </label>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Title</span>
          <input className="input" name="title" defaultValue={values?.title ?? ""} placeholder="Defaults to the file name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Document type<span className="text-rose-500"> *</span>
          </span>
          <select className="input" name="documentType" required defaultValue={values?.documentType ?? ""}>
            <option value="" disabled>
              Select type…
            </option>
            {documentTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">About</span>
          <select className="input" name="linkType" value={linkType} onChange={(e) => setLinkType(e.target.value as NoteLinkType)}>
            {NOTE_LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {NOTE_LINK_META[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            {meta.label}
            <span className="text-rose-500"> *</span>
          </span>
          <select className="input" name={meta.field} defaultValue={selectedId} key={linkType} required>
            <option value="" disabled>
              Select {meta.label.toLowerCase()}…
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {options.length === 0 ? <span className="mt-1 block text-xs text-amber-600">No {meta.label.toLowerCase()} records yet.</span> : null}
        </label>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-6">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
