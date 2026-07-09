"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { NoteFormState } from "@/app/(workspace)/notes/actions";
import { NOTE_LINK_META, NOTE_LINK_TYPES, type NoteLinkType } from "@/lib/note-links";

type Option = { value: string; label: string };

export type NoteFormValues = {
  body?: string | null;
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

export function NoteForm({
  action,
  values,
  records,
  submitLabel,
  cancelHref,
}: {
  action: (state: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  values?: NoteFormValues;
  records: Record<NoteLinkType, Option[]>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const [linkType, setLinkType] = useState<NoteLinkType>(values?.linkType ?? "seller");

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

      <div className="grid gap-5 sm:grid-cols-2">
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
          {/* Named per type; the action reads only the field matching linkType. */}
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
          {options.length === 0 ? (
            <span className="mt-1 block text-xs text-amber-600">No {meta.label.toLowerCase()} records yet.</span>
          ) : null}
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Note<span className="text-rose-500"> *</span>
        </span>
        <textarea className="input min-h-[130px] resize-y" name="body" required defaultValue={values?.body ?? ""} placeholder="What happened, what you learned, or the next step." />
      </label>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-6">
        <SubmitButton label={submitLabel} />
        <Link className="btn-ghost" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
