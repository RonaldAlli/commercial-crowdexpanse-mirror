// Pure call state machine for the browser softphone (Branch 2). All transitions live here so the UI is
// a thin renderer and the behavior is unit-testable without WebRTC, a provider, or a browser. The real
// Telnyx WebRTC adapter (later, credential-gated) drives these same events.

export type SoftphoneStatus =
  | "idle"
  | "acquiring_mic"
  | "connecting"
  | "ringing"
  | "active"
  | "ended"
  | "error";

export type SoftphoneState = {
  status: SoftphoneStatus;
  muted: boolean;
  onHold: boolean;
  seconds: number; // in-call duration; only advances while active and not on hold
  digits: string; // dial-pad buffer (editable only while idle)
  errorReason: string | null;
};

export type SoftphoneEvent =
  | { type: "PRESS_DIGIT"; digit: string }
  | { type: "BACKSPACE" }
  | { type: "SET_DIGITS"; digits: string }
  | { type: "DIAL" }
  | { type: "MIC_GRANTED" }
  | { type: "MIC_DENIED" }
  | { type: "NOT_CONFIGURED" }
  | { type: "REMOTE_RINGING" }
  | { type: "ANSWERED" }
  | { type: "TICK" }
  | { type: "TOGGLE_MUTE" }
  | { type: "TOGGLE_HOLD" }
  | { type: "HANGUP" }
  | { type: "ERROR"; reason: string }
  | { type: "RESET" };

export const initialSoftphoneState: SoftphoneState = {
  status: "idle",
  muted: false,
  onHold: false,
  seconds: 0,
  digits: "",
  errorReason: null,
};

const IN_PROGRESS: SoftphoneStatus[] = ["acquiring_mic", "connecting", "ringing", "active"];

export function isInProgress(status: SoftphoneStatus): boolean {
  return IN_PROGRESS.includes(status);
}

export function softphoneReducer(state: SoftphoneState, event: SoftphoneEvent): SoftphoneState {
  switch (event.type) {
    case "PRESS_DIGIT":
      // Dial-pad edits only while idle; during a call, DTMF is sent by the adapter (not modeled here).
      return state.status === "idle" ? { ...state, digits: state.digits + event.digit } : state;
    case "BACKSPACE":
      return state.status === "idle" ? { ...state, digits: state.digits.slice(0, -1) } : state;
    case "SET_DIGITS":
      return state.status === "idle" ? { ...state, digits: event.digits } : state;
    case "DIAL":
      if (state.status !== "idle" || state.digits.length === 0) return state;
      return { ...state, status: "acquiring_mic", seconds: 0, muted: false, onHold: false, errorReason: null };
    case "MIC_GRANTED":
      return state.status === "acquiring_mic" ? { ...state, status: "connecting" } : state;
    case "MIC_DENIED":
      return { ...state, status: "error", errorReason: "Microphone permission denied" };
    case "NOT_CONFIGURED":
      return { ...state, status: "error", errorReason: "Voice provider not configured" };
    case "REMOTE_RINGING":
      return state.status === "connecting" ? { ...state, status: "ringing" } : state;
    case "ANSWERED":
      return state.status === "ringing" || state.status === "connecting"
        ? { ...state, status: "active", seconds: 0 }
        : state;
    case "TICK":
      return state.status === "active" && !state.onHold ? { ...state, seconds: state.seconds + 1 } : state;
    case "TOGGLE_MUTE":
      return state.status === "active" ? { ...state, muted: !state.muted } : state;
    case "TOGGLE_HOLD":
      return state.status === "active" ? { ...state, onHold: !state.onHold } : state;
    case "HANGUP":
      return isInProgress(state.status) ? { ...state, status: "ended" } : state;
    case "ERROR":
      return { ...state, status: "error", errorReason: event.reason };
    case "RESET":
      return { ...initialSoftphoneState, digits: state.digits };
    default:
      return state;
  }
}
