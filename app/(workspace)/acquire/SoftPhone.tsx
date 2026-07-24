"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { formatDuration } from "@/lib/format-duration";
import { softphoneReducer, initialSoftphoneState, isInProgress, type SoftphoneState } from "@/lib/comms/softphone-machine";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function statusLabel(s: SoftphoneState): string {
  switch (s.status) {
    case "idle": return "Ready to call";
    case "acquiring_mic": return "Requesting microphone…";
    case "connecting": return "Connecting…";
    case "ringing": return "Ringing…";
    case "active": return s.onHold ? "On hold" : "In call";
    case "ended": return "Call ended";
    case "error": return s.errorReason ?? "Error";
  }
}

type AudioDevice = { deviceId: string; label: string };

// Compact softphone for the operator dock: status + timer + number + call controls always shown;
// keypad and audio-device selectors tuck behind a toggle so the dock stays short. Inert until a voice
// provider is configured (shows "Voice provider not configured" instead of failing).
export function SoftPhone({ toNumber }: { toNumber: string | null }) {
  const [state, dispatch] = useReducer(softphoneReducer, { ...initialSoftphoneState, digits: toNumber ?? "" });
  const [mics, setMics] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const [showMore, setShowMore] = useState(false);
  const dialing = useRef(false);

  useEffect(() => {
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_DIGITS", digits: toNumber ?? "" });
  }, [toNumber]);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Microphone" })));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Speaker" })));
    } catch { /* best-effort */ }
  }, []);
  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  useEffect(() => {
    if (state.status !== "active" || state.onHold) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.status, state.onHold]);

  async function onCall() {
    if (dialing.current || state.digits.length === 0) return;
    dialing.current = true;
    dispatch({ type: "DIAL" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: micId } : true });
      stream.getTracks().forEach((t) => t.stop());
      dispatch({ type: "MIC_GRANTED" });
      void refreshDevices();
    } catch {
      dispatch({ type: "MIC_DENIED" });
      dialing.current = false;
      return;
    }
    try {
      const res = await fetch("/api/comms/voice/token");
      const json = (await res.json()) as { configured: boolean; reason?: string };
      if (!json.configured) dispatch({ type: "NOT_CONFIGURED" });
      else dispatch({ type: "ERROR", reason: "Live voice connection is not yet enabled." });
    } catch {
      dispatch({ type: "ERROR", reason: "Could not reach the voice service." });
    } finally {
      dialing.current = false;
    }
  }

  const inProgress = isInProgress(state.status);
  const showTimer = state.status === "active" || state.status === "ended";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Icon name="phone" className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium text-slate-900">{statusLabel(state)}</span>
        </div>
        {showTimer ? <span className="font-mono text-sm tabular-nums text-slate-700">{formatDuration(state.seconds)}</span> : null}
      </div>

      {state.status === "error" ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">{state.errorReason}</p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <input
          aria-label="Number to dial"
          className="input h-10 flex-1 text-center font-mono text-sm tracking-wide"
          value={state.digits}
          readOnly={inProgress}
          onChange={(e) => dispatch({ type: "SET_DIGITS", digits: e.target.value })}
          placeholder="No number"
        />
        {!inProgress ? (
          <button type="button" onClick={onCall} disabled={state.digits.length === 0} className="btn-primary disabled:opacity-40">
            <Icon name="phone" className="h-4 w-4" />
            Call
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: "HANGUP" })} className="btn border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
            Hang up
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={state.status !== "active"} onClick={() => dispatch({ type: "TOGGLE_MUTE" })} className={`btn flex-1 text-xs disabled:opacity-40 ${state.muted ? "bg-slate-800 text-white" : ""}`}>
          {state.muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" disabled={state.status !== "active"} onClick={() => dispatch({ type: "TOGGLE_HOLD" })} className={`btn flex-1 text-xs disabled:opacity-40 ${state.onHold ? "bg-slate-800 text-white" : ""}`}>
          {state.onHold ? "Resume" : "Hold"}
        </button>
        <button type="button" onClick={() => setShowMore((v) => !v)} className="btn text-xs">
          {showMore ? "Hide keypad" : "Keypad"}
        </button>
      </div>

      {showMore ? (
        <div className="mt-2">
          <div className="grid grid-cols-3 gap-1.5">
            {KEYPAD.map((k) => (
              <button key={k} type="button" disabled={inProgress} onClick={() => dispatch({ type: "PRESS_DIGIT", digit: k })} className="btn h-9 text-sm font-medium disabled:opacity-40">
                {k}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select aria-label="Microphone" className="input h-8 text-xs" value={micId} onChange={(e) => setMicId(e.target.value)}>
              <option value="">Mic: default</option>
              {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
            </select>
            <select aria-label="Speaker" className="input h-8 text-xs" value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
              <option value="">Speaker: default</option>
              {speakers.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
