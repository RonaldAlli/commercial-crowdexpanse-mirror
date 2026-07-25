// Copilot Service — thin transport. Wires the Workspace Brain to the LLM provider:
// resolve intent → retrieve context → assemble prompt → stream. Stateless:
// conversation memory lives client-side and is replayed as `history` each turn;
// context is re-retrieved per turn from the latest question. No reasoning lives here.

import type { CurrentUser } from "@/lib/auth";
import type { ProviderCtx } from "@/lib/ai/context/types";
import { getLlmProvider } from "@/lib/ai/llm";
import type { LlmMessage, LlmProvider } from "@/lib/ai/llm";

import { resolveIntent } from "./brain/intent";
import { retrieve } from "./brain/retrieve";
import { buildSystemPrompt, type SourceListEntry } from "./brain/prompt";

const MAX_TOKENS = 1500;

export type CopilotRequest = {
  consumer: string; // e.g. "acquisition"
  user: CurrentUser; // org + actor from the session — never request input
  subjectId: string; // the seller id
  question: string;
  history: LlmMessage[];
  shortcutId?: string;
};

export type CopilotResult = {
  stream: AsyncIterable<string>;
  sources: SourceListEntry[];
};

// `deps.llm` is a narrow test seam for injecting the external LLM boundary in
// integration tests; production uses the configured provider. No logic moves out of
// the Brain — this only makes the outbound provider injectable.
export type RunCopilotDeps = { llm?: LlmProvider };

// Throws CopilotNotFoundError when the subject is not in the caller's org.
export async function runCopilot(req: CopilotRequest, deps: RunCopilotDeps = {}): Promise<CopilotResult> {
  const intent = resolveIntent({ shortcutId: req.shortcutId, question: req.question });
  const ctx: ProviderCtx = { user: req.user, subjectId: req.subjectId };

  const fragments = await retrieve(intent.providers, ctx);
  const { system, sources } = buildSystemPrompt(req.consumer, intent, fragments);

  const messages: LlmMessage[] = [...req.history, { role: "user", content: req.question }];
  const llm = deps.llm ?? getLlmProvider();
  const stream = llm.stream({ system, messages, maxTokens: MAX_TOKENS });

  return { stream, sources };
}
