"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Icon } from "@/components/icons";
import { SoftPhone } from "./SoftPhone";
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
export type WsCall = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  durationSec: number | null;
  disposition: string | null;
  timeLabel: string;
  at: number;
};
export type WsChannelStatus = { configured: boolean; reason: string | null };

const TABS = ["Phone", "SMS", "WhatsApp", "Email", "History"] as const;
type Tab = (typeof TABS)[number];
const TAB_ICON = { Phone: "phone", SMS: "notes", WhatsApp: "spark", Email: "mail", History: "activity" } as const;
const TAB_CHANNEL: Record<"SMS" | "WhatsApp" | "Email", "SMS" | "WHATSAPP" | "EMAIL"> = { SMS: "SMS", WhatsApp: "WHATSAPP", Email: "EMAIL" };

function statusTone(status: string): string {
  if (status === "DELIVERED" || status === "SENT") return "text-emerald-600";
  if (status === "FAILED") return "text-rose-600";
  if (status === "RECEIVED") return "text-slate-500";
  return "text-slate-400"; // QUEUED
}

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
          {out ? <span className={`ml-1 font-medium ${out ? "text-white/80" : statusTone(m.status)}`}>· {m.status.toLowerCase()}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function ConversationWorkspace({
  sellerId,
  phone,
  email,
  messages,
  calls,
  channelStatus,
}: {
  sellerId: string;
  phone: string | null;
  email: string | null;
  messages: WsMessage[];
  calls: WsCall[];
  channelStatus: Record<"SMS" | "WHATSAPP" | "EMAIL", WsChannelStatus>;
}) {
  const [tab, setTab] = useState<Tab>("Phone");
  const [query, setQuery] = useState("");

  const unread = useMemo(() => {
    const u: Record<"SMS" | "WHATSAPP" | "EMAIL", number> = { SMS: 0, WHATSAPP: 0, EMAIL: 0 };
    for (const m of messages) if (m.direction === "INBOUND") u[m.channel] += 1;
    return u;
  }, [messages]);

  const history = useMemo(
    () => [...messages.map((m) => ({ at: m.at, msg: m } as const)), ...calls.map((c) => ({ at: c.at, call: c } as const))].sort((a, b) => a.at - b.at),
    [messages, calls],
  );

  function channelMessages(ch: "SMS" | "WHATSAPP" | "EMAIL") {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => m.channel === ch && (!q || m.body.toLowerCase().includes(q) || (m.subject ?? "").toLowerCase().includes(q)));
  }

  function unreadBadge(tabName: Tab) {
    const ch = tabName === "SMS" ? "SMS" : tabName === "WhatsApp" ? "WHATSAPP" : tabName === "Email" ? "EMAIL" : null;
    if (!ch || unread[ch] === 0) return null;
    return <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{unread[ch]}</span>;
  }

  return (
    <div className="rounded-xl border border-slate-200">
      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-100">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${tab === t ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Icon name={TAB_ICON[t]} className="h-4 w-4" />
            {t}
            {unreadBadge(t)}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "Phone" ? (
          <div className="space-y-4">
            <SoftPhone toNumber={phone} />
            <div>
              <p className="eyebrow mb-2">Recent calls</p>
              {calls.length === 0 ? (
                <p className="text-sm text-slate-400">No calls logged yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {[...calls].sort((a, b) => b.at - a.at).map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-700">{c.direction === "OUTBOUND" ? "Outbound" : "Inbound"}{c.disposition ? ` · ${c.disposition}` : ""}</span>
                      <span className="text-xs text-slate-400">{c.durationSec != null ? `${c.durationSec}s · ` : ""}{c.timeLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : tab === "History" ? (
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No communications yet. Calls, texts, and emails will appear here.</p>
            ) : (
              history.map((item) =>
                "msg" in item ? (
                  <MessageBubble key={item.msg.id} m={item.msg} />
                ) : (
                  <div key={item.call.id} className="text-center text-xs text-slate-400">
                    ☎ {item.call.direction === "OUTBOUND" ? "Outbound call" : "Inbound call"}
                    {item.call.disposition ? ` · ${item.call.disposition}` : ""} · {item.call.timeLabel}
                  </div>
                ),
              )
            )}
          </div>
        ) : (
          // SMS / WhatsApp / Email
          (() => {
            const ch = TAB_CHANNEL[tab];
            const st = channelStatus[ch];
            const thread = channelMessages(ch);
            const toAddr = ch === "EMAIL" ? email : phone;
            return (
              <div className="space-y-3">
                {/* Search */}
                <div className="flex items-center gap-2">
                  <Icon name="search" className="h-4 w-4 text-slate-400" />
                  <input className="input h-9 text-sm" placeholder={`Search ${tab}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>

                {/* Thread */}
                <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg bg-slate-50/60 p-3">
                  {thread.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">
                      {query ? "No matching messages." : `No ${tab} messages yet.`}
                    </p>
                  ) : (
                    thread.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                </div>

                {/* Compose — config-gated */}
                {!st.configured ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {st.reason} — configure a provider to send.
                  </p>
                ) : null}
                <form action={sendCommsMessage.bind(null, sellerId, ch)} className="space-y-2">
                  {ch === "EMAIL" ? <input name="subject" className="input h-9 text-sm" placeholder="Subject" disabled={!st.configured} /> : null}
                  <textarea
                    name="body"
                    disabled={!st.configured || !toAddr}
                    className="input min-h-[70px] resize-y text-sm disabled:bg-slate-50"
                    placeholder={!toAddr ? `No ${ch === "EMAIL" ? "email" : "number"} on file` : st.configured ? `Message ${tab}…` : st.reason ?? "Not configured"}
                  />
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
    </div>
  );
}
