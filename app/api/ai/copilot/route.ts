// AI Copilot streaming endpoint — a THIN consumer of the Copilot Service. It only:
// authenticate → validate request → build the request → runCopilot() → stream.
// No business logic, no prompt/intent/retrieval/provider-selection logic lives here;
// those already exist in lib/ai/*. Tenant + actor come from the session, never the body.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { resolveAiStatus } from "@/lib/ai/llm";
import type { LlmMessage } from "@/lib/ai/llm";
import { runCopilot } from "@/lib/ai/copilot-service";
import { CopilotNotFoundError } from "@/lib/ai/brain/retrieve";

export const dynamic = "force-dynamic";

type ValidRequest = {
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

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser();

  // Fail closed: with the provider unconfigured, report inert and never call the API.
  const status = resolveAiStatus();
  if (!status.configured) {
    return NextResponse.json({ configured: false, reason: status.reason });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const req = parseBody(json);
  if (!req) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let result;
  try {
    result = await runCopilot({
      consumer: "acquisition",
      user,
      subjectId: req.subjectId,
      question: req.question,
      history: req.history,
      shortcutId: req.shortcutId,
    });
  } catch (err) {
    if (err instanceof CopilotNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  // Minimal wire protocol: one JSON `sources` line, then the streamed answer text,
  // then EOF (done). No elaborate event envelope.
  const { stream, sources } = result;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ sources })}\n`));
      try {
        for await (const delta of stream) {
          controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        controller.error(err); // mid-stream failure surfaces to the client for retry
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no", // defeat nginx response buffering for SSE-style streaming
    },
  });
}
