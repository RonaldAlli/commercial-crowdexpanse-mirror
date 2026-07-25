"use client";

// The reusable Copilot pane. A pure consumer of CopilotProvider — it holds no
// source-of-truth state. The PARENT chrome sizes the column (open → width, closed →
// rail) so the workspace reflows; this component just fills its box. Used by both the
// normal work panel and the session cockpit.

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";

import { COPILOT_SHORTCUTS } from "@/lib/ai/shortcuts";
import { buildDisplaySources } from "@/lib/ai/sources";

import { useCopilot } from "./CopilotProvider";

export const COPILOT_RAIL_WIDTH = 44;

export function CopilotRegion() {
  const { aiConfigured, open, setOpen, messages, status, error, sources, send, retry } = useCopilot();
  const subjectId = useSearchParams().get("sellerId");
  const [draft, setDraft] = useState("");
  // Authoritative, deduplicated Sources for the latest answer (structured, not text).
  const displaySources = useMemo(() => buildDisplaySources(sources ?? []), [sources]);

  // Closed → a slim vertical rail with a toggle (a real, thin column — never an overlay).
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open AI Copilot"
        className="flex h-full w-full flex-col items-center gap-2 border-l border-slate-200 bg-white py-3 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      >
        <span aria-hidden className="text-base">✦</span>
        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-wide">
          AI Copilot
        </span>
      </button>
    );
  }

  const canAsk = aiConfigured && Boolean(subjectId);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || !subjectId) return;
    send({ subjectId, question: q });
    setDraft("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
  function runShortcut(s: (typeof COPILOT_SHORTCUTS)[number]) {
    if (!subjectId) return;
    send({ subjectId, question: s.prompt, shortcutId: s.id });
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <span aria-hidden>✦</span> AI Copilot
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Collapse"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <span aria-hidden className="text-sm">⟩</span>
        </button>
      </header>

      {/* Body — its own scroll region; nothing here can scroll or reflow the workspace */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!aiConfigured ? (
          <p className="text-sm text-slate-500">
            AI Copilot isn’t configured yet. It stays inert until an operator sets it up — the workspace is
            unaffected.
          </p>
        ) : !subjectId ? (
          <p className="text-sm text-slate-500">Open a seller to give the Copilot context, then ask a question.</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ask about this seller — e.g. “Summarize everything before I call” or “Draft an SMS.” The Copilot can
            read and draft; it never changes records or sends anything.
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => {
              const streaming = status === "streaming" && i === messages.length - 1 && m.role === "assistant";
              return (
                <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand-600 px-3 py-2 text-sm text-white"
                        : "max-w-[92%] whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800"
                    }
                  >
                    {m.content || (streaming ? "…" : "")}
                    {streaming && m.content ? <span className="ml-0.5 animate-pulse">▍</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Sources — authoritative + deduplicated. Complete regardless of whether the
            answer happened to include inline [S#] markers. */}
        {displaySources.length > 0 ? (
          <details className="mt-3 rounded-lg border border-slate-200 bg-white p-2 text-xs">
            <summary className="cursor-pointer font-medium text-slate-600">
              Sources ({displaySources.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {displaySources.map((d) => (
                <li key={d.dedupeKey} className="flex gap-2">
                  <span className="shrink-0 font-mono text-[10px] leading-5 text-slate-400">
                    {d.citations.join(" ")}
                  </span>
                  <span className="min-w-0 text-slate-600">{d.label}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {/* Error — isolated to the pane, with Retry. The workspace is untouched. */}
      {status === "error" && error ? (
        <div className="shrink-0 border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 rounded border border-rose-200 bg-white px-2 py-1 font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {/* Prompt shortcuts — rendered from the shared catalog (lib/ai/shortcuts.ts) */}
      {canAsk ? (
        <div className="shrink-0 border-t border-slate-100 px-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {COPILOT_SHORTCUTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => runShortcut(s)}
                disabled={status === "streaming"}
                title={s.prompt}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <form onSubmit={submit} className="shrink-0 border-t border-slate-200 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!canAsk}
          rows={2}
          placeholder={
            !aiConfigured ? "Not configured" : !subjectId ? "Open a seller first" : "Ask the Copilot…"
          }
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm outline-none focus:border-brand-500 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</span>
          <button
            type="submit"
            disabled={!canAsk || draft.trim() === ""}
            className="btn-primary px-3 py-1 text-xs disabled:opacity-40"
          >
            {status === "streaming" ? "Streaming…" : "Send"}
          </button>
        </div>
      </form>
    </aside>
  );
}
