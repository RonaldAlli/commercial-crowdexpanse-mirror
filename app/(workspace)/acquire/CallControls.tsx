"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { formatDuration } from "@/lib/format-duration";

// Phase A — Click-to-call + call timer. The anchor's tel: hands off to the OS/softphone dialer (no page
// navigation); clicking it starts an on-screen timer so the rep can track call length. Outcome logging +
// auto-advance are the disposition buttons rendered by the server component next to this.
export function CallControls({ phone }: { phone: string | null }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  function startTimer() {
    setSeconds(0);
    setRunning(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopTimer() {
    setRunning(false);
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }

  if (!phone) {
    return <p className="text-sm text-slate-400">No phone number on file.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={`tel:${phone}`} onClick={startTimer} className="btn-primary">
        <Icon name="phone" className="h-4 w-4" />
        Call {phone}
      </a>
      <span className="font-mono text-sm tabular-nums text-slate-700">{formatDuration(seconds)}</span>
      {running ? (
        <button type="button" onClick={stopTimer} className="btn-ghost">
          End call
        </button>
      ) : null}
    </div>
  );
}
