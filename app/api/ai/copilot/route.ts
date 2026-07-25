// AI Copilot streaming endpoint — a THIN consumer of the Copilot Service. It only:
// authenticate → validate request → build the request → runCopilot() → stream.
// No business logic, no prompt/intent/retrieval/provider-selection logic lives here;
// those already exist in lib/ai/*. Tenant + actor come from the session, never the body.

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { resolveCopilotRuntime } from "@/lib/ai/runtime-config";
import { runCopilot } from "@/lib/ai/copilot-service";
import { CopilotNotFoundError } from "@/lib/ai/brain/retrieve";

import { parseBody } from "./validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // the Anthropic SDK requires the Node.js runtime (not edge)

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser();

  // Fail closed: resolve the org's effective config (env override, else the
  // governance-gated encrypted store). Unconfigured ⇒ report inert, never call the API.
  const runtime = await resolveCopilotRuntime(user.organizationId);
  if (!runtime.configured) {
    return NextResponse.json({ configured: false, reason: runtime.reason });
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

  // Cancel the upstream generation if the client disconnects — stop paying for tokens
  // no one will read.
  const upstream = new AbortController();

  let result;
  try {
    result = await runCopilot(
      {
        consumer: "acquisition",
        user,
        subjectId: req.subjectId,
        question: req.question,
        history: req.history,
        shortcutId: req.shortcutId,
      },
      { signal: upstream.signal, apiKey: runtime.apiKey ?? undefined, model: runtime.model ?? undefined, timeoutMs: runtime.timeoutMs },
    );
  } catch (err) {
    if (err instanceof CopilotNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Server-side visibility for ops triage (pm2 logs). No prompt/PII — message only.
    console.error("[ai-copilot] request failed before streaming:", err instanceof Error ? err.message : err);
    // Return a structured JSON 500 rather than throwing (Next's default is an HTML
    // error page the Copilot region's fetch parser can't read) — the client's inline
    // error + Retry path depends on a predictable JSON body. No internals leaked.
    return NextResponse.json({ error: "AI Copilot request failed" }, { status: 500 });
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
        if (upstream.signal.aborted) return; // client disconnected — nothing to surface
        // mid-stream failure surfaces to the client for retry; log for ops (no PII).
        console.error("[ai-copilot] stream error:", err instanceof Error ? err.message : err);
        controller.error(err);
      }
    },
    cancel() {
      upstream.abort(); // client went away → stop the upstream Anthropic generation
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
