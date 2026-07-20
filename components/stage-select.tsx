"use client";

import { useEffect, useState } from "react";

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
 * Stage-move control implementing UI → evaluate → decide.
 *
 * PB-2 fix: the submission is DETERMINISTIC — it builds a FormData with the explicitly chosen stage +
 * reason and calls the server action directly. It does NOT rely on controlled-input state settling
 * into the DOM before a native form submit (the previous requestAnimationFrame(requestSubmit) approach
 * could submit a stale stage → a silent no-op). ALLOW commits immediately; REQUIRES_ATTESTATION opens
 * the dialog to collect a reason first; DENY / server errors surface inline. Enforcement is server-side.
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
  const [value, setValue] = useState(current);
  const [pending, setPending] = useState<{ stage: string; ev: StageEval } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setValue(current); }, [current]); // resync after a committed move refreshes the page

  async function commit(targetStage: string, reason: string) {
    setSubmitting(true);
    const formData = new FormData();
    formData.set("stage", targetStage); // explicit — never read from DOM/controlled state
    formData.set("attestationReason", reason);
    const result = await action(formData); // server action; its revalidatePath refreshes the RSC
    setSubmitting(false);
    setPending(null);
    if (result && result.error) { setError(result.error); setValue(current); }
    // On success the action revalidates → `current` updates → useEffect resyncs the select.
  }

  async function onChange(target: string) {
    if (target === current) return;
    setError(null);
    setValue(target);
    const ev = await evaluate(target);
    if ("error" in ev) { setError(ev.error); setValue(current); return; }
    if (ev.outcome === "ALLOW") { await commit(target, ""); return; }
    if (ev.outcome === "DENY") { setError(ev.message || "That stage move isn't allowed."); setValue(current); return; }
    setPending({ stage: target, ev }); // REQUIRES_ATTESTATION → collect a reason first
  }

  return (
    <>
      <select
        name="stage"
        value={value}
        disabled={submitting}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-50 ${className}`}
      >
        {stages.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      <AttestationDialog
        open={pending !== null}
        targetLabel={pending?.ev.stageLabel ?? ""}
        message={pending?.ev.message}
        suggestedAction={pending?.ev.suggestedAction}
        missingArtifacts={pending?.ev.missingArtifacts ?? []}
        submitting={submitting}
        onConfirm={(r) => { if (pending) void commit(pending.stage, r); }}
        onCancel={() => { setPending(null); setValue(current); }}
      />
    </>
  );
}
