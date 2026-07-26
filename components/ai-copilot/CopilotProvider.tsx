"use client";

// Single source of truth for ALL Copilot UI state (see
// docs/architecture/AI_COPILOT_UI_STATE.md). Mounted above both workspace chromes so
// state survives the normal↔cockpit swap. Owns a state tree fully SEPARATE from the
// operator/workspace — the copilot's loading/streaming/error never touch the app.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type { SourceListEntry } from "@/lib/ai/brain/prompt";

export type CopilotRole = "user" | "assistant";
export type CopilotMessage = { id: string; role: CopilotRole; content: string };
export type CopilotStatus = "idle" | "streaming" | "error";

export type CopilotSendArgs = { subjectId: string; question: string; shortcutId?: string };

type CopilotContextValue = {
  aiConfigured: boolean;
  // The active seller the WORKSPACE is showing, published by the acquisition page
  // (which resolves it as searchParams.sellerId ?? queue[0]). The Copilot consumes
  // this so it always sees the same seller as the dialer/timeline/panel — not just
  // the URL param. null when no seller is in context (e.g. other pages, empty queue).
  subjectId: string | null;
  setSubjectId: (id: string | null) => void;
  open: boolean;
  width: number;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setWidth: (w: number) => void;
  messages: CopilotMessage[];
  status: CopilotStatus;
  error: string | null;
  sources: SourceListEntry[] | null;
  send: (args: CopilotSendArgs) => void;
  retry: () => void;
  clear: () => void;
};

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within a CopilotProvider");
  return ctx;
}

export const COPILOT_MIN_WIDTH = 300;
export const COPILOT_MAX_WIDTH = 560;
const DEFAULT_WIDTH = 380;
const CLIENT_TIMEOUT_MS = 60_000;
const STORAGE_KEY = "copilot.ui";

function clampWidth(w: number): number {
  return Math.min(COPILOT_MAX_WIDTH, Math.max(COPILOT_MIN_WIDTH, Math.round(w)));
}

export function CopilotProvider({
  aiConfigured,
  children,
}: {
  aiConfigured: boolean;
  children: ReactNode;
}) {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const [width, setWidthState] = useState(DEFAULT_WIDTH);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [status, setStatus] = useState<CopilotStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceListEntry[] | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<CopilotSendArgs | null>(null);
  const messagesRef = useRef<CopilotMessage[]>(messages);
  const idRef = useRef(0);
  const nextId = () => `m${(idRef.current += 1)}`;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Hydrate persisted chrome state after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as { open?: unknown; width?: unknown };
      if (typeof s.open === "boolean") setOpenState(s.open);
      if (typeof s.width === "number") setWidthState(clampWidth(s.width));
    } catch {
      /* ignore malformed persisted state */
    }
  }, []);

  const persist = (o: boolean, w: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: o, width: w }));
    } catch {
      /* storage unavailable — non-fatal */
    }
  };
  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    persist(v, width);
  }, [width]);
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const setWidth = useCallback((w: number) => {
    const c = clampWidth(w);
    setWidthState(c);
    persist(open, c);
  }, [open]);

  // Abort any in-flight request when the workspace unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSend = useCallback(async (args: CopilotSendArgs, history: CopilotMessage[]) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, CLIENT_TIMEOUT_MS);

    const assistantId = nextId();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
    setStatus("streaming");
    setError(null);
    setSources(null);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: args.subjectId,
          question: args.question,
          shortcutId: args.shortcutId,
          history: history.map((h) => ({ role: h.role, content: h.content })),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(res.status === 404 ? "That seller isn’t available." : `Request failed (${res.status}).`);
      }
      // An unconfigured provider replies with JSON instead of a stream.
      if ((res.headers.get("content-type") ?? "").includes("application/json")) {
        const j = (await res.json()) as { configured?: boolean; reason?: string };
        throw new Error(j?.reason ?? "AI Copilot is not available.");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream.");

      const decoder = new TextDecoder();
      let sawSources = false;
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (!sawSources) {
          const nl = buf.indexOf("\n");
          if (nl === -1) continue;
          const head = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          sawSources = true;
          try {
            const parsed = JSON.parse(head) as { sources?: SourceListEntry[] };
            setSources(parsed.sources ?? null);
          } catch {
            setSources(null);
          }
        }
        if (sawSources && buf) {
          const chunk = buf;
          buf = "";
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + chunk } : x)));
        }
      }
      setStatus("idle");
    } catch (e) {
      // Superseded by a newer send → discard silently; the new send owns the UI.
      if (abortRef.current !== ctrl) return;
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        if (timedOut) {
          setStatus("error");
          setError("The request timed out. You can retry.");
        } else {
          // user/unmount cancel — keep any partial text, no error
          setStatus("idle");
        }
        return;
      }
      setStatus("error");
      setError(err?.message ?? "Something went wrong.");
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const send = useCallback(
    (args: CopilotSendArgs) => {
      if (!args.question.trim()) return;
      lastSendRef.current = args;
      const history = messagesRef.current;
      setMessages((m) => [...m, { id: nextId(), role: "user", content: args.question }]);
      void runSend(args, history);
    },
    [runSend],
  );

  const retry = useCallback(() => {
    const args = lastSendRef.current;
    if (!args) return;
    const base = messagesRef.current.slice();
    while (base.length && base[base.length - 1].role === "assistant") base.pop();
    if (base.length && base[base.length - 1].role === "user") base.pop(); // re-sent as `question`
    setError(null);
    setMessages([...base, { id: nextId(), role: "user", content: args.question }]);
    void runSend(args, base);
  }, [runSend]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSources(null);
    setError(null);
    setStatus("idle");
  }, []);

  const value: CopilotContextValue = {
    aiConfigured,
    subjectId,
    setSubjectId,
    open,
    width,
    setOpen,
    toggle,
    setWidth,
    messages,
    status,
    error,
    sources,
    send,
    retry,
    clear,
  };

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}
