// AI Copilot streaming endpoint — a THIN consumer of the Copilot Service. It only:
// authenticate → validate request → build the request → runCopilot() → stream.
// No business logic, no prompt/intent/retrieval/provider-selection logic lives here;
// those already exist in lib/ai/*. Tenant + actor come from the session, never the body.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { resolveAiStatus } from "@/lib/ai/llm";
import { runCopilot } from "@/lib/ai/copilot-service";
import { CopilotNotFoundError } from "@/lib/ai/brain/retrieve";

import { parseBody } from "./validate";

export const dynamic = "force-dynamic";

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
