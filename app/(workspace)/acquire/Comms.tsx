"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { formatDuration } from "@/lib/format-duration";

// Device-native communications for the operator console: Call (tel:), Text (sms:), Email (mailto:) hand
// off to the OS/softphone/mail apps — no provider or credentials. The Call button also starts an
// on-screen timer. Provider-backed sending (Twilio SMS, SMTP email), dialer, and recording are later.
export function Comms({ phone, email }: { phone: string | null; email: string | null }) {
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {phone ? (
          <a href={`tel:${phone}`} onClick={startTimer} className="btn-primary">
            <Icon name="phone" className="h-4 w-4" />
            Call
          </a>
        ) : (
          <span className="btn cursor-not-allowed opacity-50">No phone</span>
        )}
        {phone ? (
          <a href={`sms:${phone}`} className="btn">
            Text
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} className="btn">
            <Icon name="mail" className="h-4 w-4" />
            Email
          </a>
        ) : (
          <span className="btn cursor-not-allowed opacity-50">No email</span>
        )}
        {running || seconds > 0 ? (
          <span className="font-mono text-sm tabular-nums text-slate-700">{formatDuration(seconds)}</span>
        ) : null}
        {running ? (
          <button type="button" onClick={stopTimer} className="btn-ghost">
            End call
          </button>
        ) : null}
      </div>
      {phone ? <p className="mt-1.5 text-xs text-slate-400">{phone}</p> : <p className="mt-1.5 text-xs text-slate-400">No phone or email on file for this seller.</p>}
    </div>
  );
}
