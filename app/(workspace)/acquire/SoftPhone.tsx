"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { formatDuration } from "@/lib/format-duration";
import { softphoneReducer, initialSoftphoneState, isInProgress, type SoftphoneState } from "@/lib/comms/softphone-machine";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function statusLabel(s: SoftphoneState): string {
  switch (s.status) {
    case "idle": return "Ready";
    case "acquiring_mic": return "Requesting microphone…";
    case "connecting": return "Connecting…";
    case "ringing": return "Ringing…";
    case "active": return s.onHold ? "On hold" : "In call";
    case "ended": return "Call ended";
    case "error": return s.errorReason ?? "Error";
  }
}

type AudioDevice = { deviceId: string; label: string };

export function SoftPhone({ toNumber }: { toNumber: string | null }) {
  const [state, dispatch] = useReducer(softphoneReducer, { ...initialSoftphoneState, digits: toNumber ?? "" });
  const [mics, setMics] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const dialing = useRef(false);

  // Reset the dial buffer to the current seller's number whenever the seller changes.
  useEffect(() => {
    dispatch({ type: "RESET" });
    dispatch({ type: "SET_DIGITS", digits: toNumber ?? "" });
  }, [toNumber]);

  // Enumerate audio devices (labels populate once mic permission is granted).
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter((d) => d.kind === "audioinput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Microphone" })));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput").map((d) => ({ deviceId: d.deviceId, label: d.label || "Speaker" })));
    } catch {
      /* ignore — device access is best-effort */
    }
  }, []);
  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  // In-call timer.
  useEffect(() => {
    if (state.status !== "active" || state.onHold) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.status, state.onHold]);

  async function onCall() {
    if (dialing.current || state.digits.length === 0) return;
    dialing.current = true;
    dispatch({ type: "DIAL" });
    // Production-identical flow: request the mic, then obtain a WebRTC credential.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: micId } : true });
      stream.getTracks().forEach((t) => t.stop()); // released immediately; the real adapter keeps the stream
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
      if (!json.configured) {
        dispatch({ type: "NOT_CONFIGURED" });
      } else {
        // A real Telnyx WebRTC adapter connects here (credential-gated, later branch).
        dispatch({ type: "ERROR", reason: "Live voice connection is not yet enabled." });
      }
    } catch {
      dispatch({ type: "ERROR", reason: "Could not reach the voice service." });
    } finally {
      dialing.current = false;
    }
  }

  const inProgress = isInProgress(state.status);
  const showTimer = state.status === "active" || state.status === "ended";

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Icon name="phone" className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-slate-900">{statusLabel(state)}</span>
        </div>
        {showTimer ? <span className="font-mono text-sm tabular-nums text-slate-700">{formatDuration(state.seconds)}</span> : null}
      </div>

      {/* Not-configured / permission notice — informational, never a hard failure */}
      {state.status === "error" ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {state.errorReason}
        </p>
      ) : null}

      {/* Number display */}
      <input
        aria-label="Number to dial"
        className="input mt-3 h-11 text-center font-mono text-base tracking-wide"
        value={state.digits}
        readOnly={inProgress}
        onChange={(e) => dispatch({ type: "SET_DIGITS", digits: e.target.value })}
        placeholder="No number"
      />

      {/* Dial pad */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {KEYPAD.map((k) => (
          <button
            key={k}
            type="button"
            disabled={inProgress}
            onClick={() => dispatch({ type: "PRESS_DIGIT", digit: k })}
            className="btn h-11 text-base font-medium disabled:opacity-40"
          >
            {k}
          </button>
        ))}
      </div>

      {/* Call controls */}
      <div className="mt-3 flex items-center gap-2">
        {!inProgress ? (
          <button type="button" onClick={onCall} disabled={state.digits.length === 0} className="btn-primary flex-1 disabled:opacity-40">
            <Icon name="phone" className="h-4 w-4" />
            Call
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: "HANGUP" })} className="btn flex-1 border border-rose-200 bg-white text-rose-600 hover:bg-rose-50">
            Hang up
          </button>
        )}
        <button
          type="button"
          disabled={state.status !== "active"}
          onClick={() => dispatch({ type: "TOGGLE_MUTE" })}
          className={`btn disabled:opacity-40 ${state.muted ? "bg-slate-800 text-white" : ""}`}
        >
          {state.muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          disabled={state.status !== "active"}
          onClick={() => dispatch({ type: "TOGGLE_HOLD" })}
          className={`btn disabled:opacity-40 ${state.onHold ? "bg-slate-800 text-white" : ""}`}
        >
          {state.onHold ? "Resume" : "Hold"}
        </button>
      </div>

      {/* Device selectors */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">
          Microphone
          <select className="input mt-1 h-9 text-xs" value={micId} onChange={(e) => setMicId(e.target.value)}>
            <option value="">Default</option>
            {mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500">
          Speaker
          <select className="input mt-1 h-9 text-xs" value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
            <option value="">Default</option>
            {speakers.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
