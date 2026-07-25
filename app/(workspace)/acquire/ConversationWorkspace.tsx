"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "@/components/icons";
import { onDraftInsert, mergeDraftText } from "@/lib/ai/draft-insert";
import { sendCommsMessage } from "./comms-actions";

export type WsMessage = {
  id: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  subject: string | null;
  status: string;
  timeLabel: string;
  at: number;
};
export type WsChannelStatus = { configured: boolean; reason: string | null };
export type WsTimelineEntry =
  | { kind: "call"; timeLabel: string; direction: string; status: string; disposition: string | null; durationSec: number | null }
  | { kind: "message"; timeLabel: string; channel: string; direction: string; status: string; body: string; subject: string | null }
  | { kind: "touch"; timeLabel: string; touchType: string; summary: string | null; actor: string | null }
  | { kind: "status"; timeLabel: string; label: string };

const TABS = ["SMS", "WhatsApp", "Email", "Timeline"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { SMS: "notes", WhatsApp: "spark", Email: "mail", Timeline: "activity" } as const;
const TAB_CHANNEL: Record<"SMS" | "WhatsApp" | "Email", "SMS" | "WHATSAPP" | "EMAIL"> = { SMS: "SMS", WhatsApp: "WHATSAPP", Email: "EMAIL" };

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn-primary disabled:opacity-40">
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

function MessageBubble({ m }: { m: WsMessage }) {
  const out = m.direction === "OUTBOUND";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${out ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900"}`}>
        {m.subject ? <p className="mb-0.5 text-xs font-semibold opacity-80">{m.subject}</p> : null}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        <p className={`mt-1 text-[10px] ${out ? "text-white/70" : "text-slate-400"}`}>
          {m.timeLabel}
          {out ? <span className="ml-1 font-medium text-white/80">· {m.status.toLowerCase()}</span> : null}
        </p>
      </div>
    </div>
  );
}

function TimelineRow({ e }: { e: WsTimelineEntry }) {
  const meta =
    e.kind === "call" ? { icon: "phone" as const, text: `${e.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call${e.disposition ? ` · ${e.disposition}` : ""}${e.durationSec != null ? ` · ${e.durationSec}s` : ""}` }
    : e.kind === "message" ? { icon: e.channel === "EMAIL" ? ("mail" as const) : ("notes" as const), text: `${e.channel === "EMAIL" ? "Email" : e.channel === "WHATSAPP" ? "WhatsApp" : "SMS"} ${e.direction === "OUTBOUND" ? "sent" : "received"}: ${e.subject ? `${e.subject} — ` : ""}${e.body}` }
    : e.kind === "touch" ? { icon: "activity" as const, text: e.summary ?? e.touchType }
    : { icon: "check" as const, text: e.label };
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon name={meta.icon} className="h-3 w-3" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-800">{meta.text}</p>
        <p className="mt-0.5 text-xs text-slate-400">{e.timeLabel}</p>
      </div>
    </li>
  );
}

export function ConversationWorkspace({
  sellerId,
  phone,
  email,
  messages,
  channelStatus,
  timeline,
}: {
  sellerId: string;
  phone: string | null;
  email: string | null;
  messages: WsMessage[];
  channelStatus: Record<"SMS" | "WHATSAPP" | "EMAIL", WsChannelStatus>;
  timeline: WsTimelineEntry[];
}) {
  const [tab, setTab] = useState<Tab>("Timeline");
  const [query, setQuery] = useState("");

  // Opt in as a draft-insert target for the Copilot. The Copilot only DISPATCHES a
  // request; this editor owns the decision — apply to the active/enabled composer
  // (replace when empty, append otherwise) and accept, or reject (no accept) when
  // there is no enabled composer, in which case the Copilot falls back to clipboard.
  const composeRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(
    () =>
      onDraftInsert((req, accept) => {
        const el = composeRef.current;
        if (!el || el.disabled) return;
        el.value = mergeDraftText(el.value, req.text);
        el.focus();
        accept();
      }),
    [],
  );

  const unread = useMemo(() => {
    const u: Record<"SMS" | "WHATSAPP" | "EMAIL", number> = { SMS: 0, WHATSAPP: 0, EMAIL: 0 };
    for (const m of messages) if (m.direction === "INBOUND") u[m.channel] += 1;
    return u;
  }, [messages]);

  function channelMessages(ch: "SMS" | "WHATSAPP" | "EMAIL") {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => m.channel === ch && (!q || m.body.toLowerCase().includes(q) || (m.subject ?? "").toLowerCase().includes(q)));
  }
  function unreadBadge(t: Tab) {
    const ch = t === "SMS" ? "SMS" : t === "WhatsApp" ? "WHATSAPP" : t === "Email" ? "EMAIL" : null;
    if (!ch || unread[ch] === 0) return null;
    return <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{unread[ch]}</span>;
  }

  return (
    <article className="card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-slate-100">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${tab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}>
            <Icon name={TAB_ICON[t]} className="h-4 w-4" />
            {t}
            {unreadBadge(t)}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "Timeline" ? (
          <div className="max-h-[460px] overflow-y-auto">
            {timeline.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No activity yet. Calls, messages, notes, and status changes appear here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {timeline.map((e, i) => <TimelineRow key={i} e={e} />)}
              </ul>
            )}
          </div>
        ) : (
          (() => {
            const ch = TAB_CHANNEL[tab];
            const st = channelStatus[ch];
            const thread = channelMessages(ch);
            const toAddr = ch === "EMAIL" ? email : phone;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon name="search" className="h-4 w-4 text-slate-400" />
                  <input className="input h-9 text-sm" placeholder={`Search ${tab}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-lg bg-slate-50/60 p-3">
                  {thread.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">{query ? "No matching messages." : `No ${tab} messages yet.`}</p>
                  ) : (
                    thread.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                </div>
                {!st.configured ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{st.reason} — configure a provider to send.</p>
                ) : null}
                <form action={sendCommsMessage.bind(null, sellerId, ch)} className="space-y-2">
                  {ch === "EMAIL" ? <input name="subject" className="input h-9 text-sm" placeholder="Subject" disabled={!st.configured} /> : null}
                  <textarea ref={composeRef} name="body" disabled={!st.configured || !toAddr} className="input min-h-[70px] resize-y text-sm disabled:bg-slate-50" placeholder={!toAddr ? `No ${ch === "EMAIL" ? "email" : "number"} on file` : st.configured ? `Message ${tab}…` : st.reason ?? "Not configured"} />
                  <div className="flex items-center justify-between">
                    <button type="button" disabled className="text-xs text-slate-400" title="Attachments coming soon">
                      <Icon name="upload" className="mr-1 inline h-3.5 w-3.5" />Attach
                    </button>
                    <SendButton disabled={!st.configured || !toAddr} />
                  </div>
                </form>
              </div>
            );
          })()
        )}
      </div>
    </article>
  );
}
