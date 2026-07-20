"use client";

import { useEffect, useRef, useState } from "react";

import { AttestationDialog } from "./attestation-dialog";

type StageEval = {
  outcome: "ALLOW" | "REQUIRES_ATTESTATION" | "DENY";
  stageLabel: string;
  missingTruth: string[];
  missingArtifacts: string[];
  message: string;
  suggestedAction: string;
  canOverride: boolean;
};

/**
 * Stage-move control implementing the semantic-contract flow: UI → evaluate → decide.
 * ALLOW submits immediately; REQUIRES_ATTESTATION opens the reusable AttestationDialog to collect a
 * reason before submitting (recorded as an attestation); DENY / move errors (role gate, PAID gate)
 * surface inline. Enforcement is server-side — this only improves UX.
 */
export function StageSelect({
  action,
  evaluate,
  current,
  stages,
  className = "",
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  evaluate: (stage: string) => Promise<StageEval | { error: string }>;
  current: string;
  stages: { value: string; label: string }[];
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(current);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<{ stage: string; ev: StageEval } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setValue(current); }, [current]); // resync after a committed move refreshes the page

  const submit = (stage: string, attestationReason: string) => {
    setValue(stage);
    setReason(attestationReason);
    // Submit after state flushes to the DOM so the select + hidden reason carry the new values.
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  };

  async function onChange(target: string) {
    if (target === current) return;
    setError(null);
    setValue(target);
    const ev = await evaluate(target);
    if ("error" in ev) { setError(ev.error); setValue(current); return; }
    if (ev.outcome === "ALLOW") { submit(target, ""); return; }
    if (ev.outcome === "DENY") { setError(ev.message || "That stage move isn't allowed."); setValue(current); return; }
    setPending({ stage: target, ev }); // REQUIRES_ATTESTATION → collect a reason
  }

  return (
    <>
      <form
        ref={formRef}
        action={async (formData) => {
          const r = await action(formData);
          if (r && r.error) { setError(r.error); setValue(current); }
          setSubmitting(false);
        }}
      >
        <input type="hidden" name="attestationReason" value={reason} readOnly />
        <select
          name="stage"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 ${className}`}
        >
          {stages.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </form>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      <AttestationDialog
        open={pending !== null}
        targetLabel={pending?.ev.stageLabel ?? ""}
        message={pending?.ev.message}
        suggestedAction={pending?.ev.suggestedAction}
        missingArtifacts={pending?.ev.missingArtifacts ?? []}
        submitting={submitting}
        onConfirm={(r) => { const st = pending?.stage; setPending(null); if (st) { setSubmitting(true); submit(st, r); } }}
        onCancel={() => { setPending(null); setValue(current); }}
      />
    </>
  );
}
