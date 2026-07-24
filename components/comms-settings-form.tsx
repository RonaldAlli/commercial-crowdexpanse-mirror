"use client";

import { useState, useTransition } from "react";

import { saveCommsSettings, testCommsConnection } from "@/app/(workspace)/settings/communications/actions";
import type { CommsReadiness } from "@/lib/comms/provider-settings";

type Initial = {
  fromNumber: string;
  connectionId: string;
  messagingProfileId: string;
  apiKeyLast4: string | null;
  smsEnabled: boolean;
  voiceEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
};

const CHANNELS: { name: keyof Initial; label: string; hint: string }[] = [
  { name: "smsEnabled", label: "SMS", hint: "Text messaging via Telnyx" },
  { name: "voiceEnabled", label: "Voice", hint: "Browser softphone calling" },
  { name: "whatsappEnabled", label: "WhatsApp", hint: "WhatsApp Business messaging" },
  { name: "emailEnabled", label: "Email", hint: "Outbound email" },
];

/** Telnyx communications configuration. ADMIN-only; the server re-validates and encrypts secrets at rest. */
export function CommsSettingsForm({ initial, readiness }: { initial: Initial; readiness: CommsReadiness }) {
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {!readiness.encryptionReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Encryption key not set</p>
          <p className="mt-1 text-amber-800">
            Set <code className="rounded bg-amber-100 px-1">COMMS_ENCRYPTION_KEY</code> (a 64-char hex string —
            <code className="ml-1 rounded bg-amber-100 px-1">openssl rand -hex 32</code>) on the server before saving an
            API key. Channel toggles and non-secret fields can still be saved.
          </p>
        </div>
      ) : null}

      {/* Per-channel readiness */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {readiness.channels.map((c) => (
          <div key={c.key} className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
            <p className={`mt-0.5 text-sm font-semibold ${c.status.configured ? "text-emerald-600" : "text-slate-400"}`}>
              {c.status.configured ? "Ready" : "Not ready"}
            </p>
            {!c.status.configured && c.status.reason ? <p className="mt-0.5 text-[11px] text-slate-400">{c.status.reason}</p> : null}
          </div>
        ))}
      </div>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setNotice(null);
          start(async () => {
            const res = await saveCommsSettings(fd);
            if (res?.error) setError(res.error);
            else setNotice(res?.message ?? "Saved.");
          });
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-500">Enabled channels</legend>
          {CHANNELS.map((ch) => (
            <label key={ch.name} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <input type="checkbox" name={ch.name} defaultChecked={Boolean(initial[ch.name])} className="h-4 w-4" />
              <span className="text-sm font-medium text-slate-800">{ch.label}</span>
              <span className="ml-auto text-xs text-slate-400">{ch.hint}</span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500" htmlFor="fromNumber">From number (E.164)</label>
            <input id="fromNumber" name="fromNumber" defaultValue={initial.fromNumber} placeholder="+14045551234" className="input mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500" htmlFor="messagingProfileId">Messaging profile ID</label>
            <input id="messagingProfileId" name="messagingProfileId" defaultValue={initial.messagingProfileId} className="input mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500" htmlFor="connectionId">Voice connection ID</label>
            <input id="connectionId" name="connectionId" defaultValue={initial.connectionId} className="input mt-1 h-10 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500" htmlFor="apiKey">Telnyx API key</label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={initial.apiKeyLast4 ? `•••• ${initial.apiKeyLast4} (leave blank to keep)` : "Paste your Telnyx API key"}
              className="input mt-1 h-10 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">Stored encrypted (AES-256-GCM). Never shown again after saving.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={testing}
            onClick={() => {
              setError(null);
              setNotice(null);
              startTest(async () => {
                const res = await testCommsConnection();
                if (res?.error) setError(res.error);
                else setNotice(res?.message ?? "OK.");
              });
            }}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {notice ? <span className="text-xs font-medium text-emerald-600">{notice}</span> : null}
          {error ? <span className="text-xs text-rose-600">{error}</span> : null}
        </div>
      </form>
    </div>
  );
}
