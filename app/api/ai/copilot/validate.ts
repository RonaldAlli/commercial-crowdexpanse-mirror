// Request validation for the copilot route, kept in its own module so route.ts
// exports only HTTP handlers (Next.js rejects extra exports from a route file).

import type { LlmMessage } from "@/lib/ai/llm";

export type ValidRequest = {
  subjectId: string;
  question: string;
  history: LlmMessage[];
  shortcutId?: string;
};

export function parseBody(raw: unknown): ValidRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.subjectId !== "string" || b.subjectId.trim() === "") return null;
  if (typeof b.question !== "string" || b.question.trim() === "") return null;
  if (b.shortcutId !== undefined && typeof b.shortcutId !== "string") return null;

  const history: LlmMessage[] = [];
  if (b.history !== undefined) {
    if (!Array.isArray(b.history)) return null;
    for (const m of b.history) {
      if (!m || typeof m !== "object") return null;
      const role = (m as Record<string, unknown>).role;
      const content = (m as Record<string, unknown>).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      history.push({ role, content });
    }
  }

  return {
    subjectId: b.subjectId,
    question: b.question,
    history: history.slice(-20), // defensive cap; the client owns conversation memory
    shortcutId: typeof b.shortcutId === "string" ? b.shortcutId : undefined,
  };
}
