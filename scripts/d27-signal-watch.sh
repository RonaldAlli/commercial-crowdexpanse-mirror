#!/usr/bin/env bash
# D27 attribution watcher — ARM AS ROOT, then leave running.
#
# Purpose: the automation-runtime SIGINT is a LATENT INTERMITTENT defect (it did not reproduce on 2026-07-23).
# This watcher captures the SENDER of any SIGINT (signal 2) delivered to ANY process, to a persistent log, so the
# next recurrence is attributed — pid/uid/comm of the sender — satisfying AC-D27-1 without forcing a reproduction.
#
# Safety: READ-ONLY / OBSERVATIONAL. It sends no signals, starts/stops nothing, and changes no pm2/app config. It is
# INERT until run as root. Low-overhead (a filtered kernel tracepoint). Least-privilege per the D27 charter.
#
# Usage:   sudo bash scripts/d27-signal-watch.sh            # runs until Ctrl-C; appends to the log
# Log:     ${D27_LOG:-/var/log/d27-signal-watch.log}
# Read it: grep SIGINT "$D27_LOG"   → then map sender_pid to its full command:  ps -p <sender_pid> -o pid,ppid,user,comm,args
#
# When a line appears, paste it back for the report (AC-D27-1) — then D27 moves from hypothesis to attributed sender.
set -euo pipefail
LOG="${D27_LOG:-/var/log/d27-signal-watch.log}"
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
echo "[d27] $(ts) arming SIGINT signal-generate watch → $LOG" | tee -a "$LOG"

if command -v bpftrace >/dev/null 2>&1; then
  # signal:signal_generate fires for EVERY signal generation path (kill/tgkill/rt_sigqueueinfo/kernel), filtered to SIGINT.
  bpftrace -e '
    tracepoint:signal:signal_generate /args->sig == 2/ {
      printf("%s SIGINT  tgt_pid=%d tgt_comm=%s  sender_pid=%d sender_comm=%s sender_uid=%d\n",
             strftime("%Y-%m-%dT%H:%M:%S", nsecs), args->pid, args->comm, pid, comm, uid);
    }' | tee -a "$LOG"
elif command -v auditctl >/dev/null 2>&1; then
  echo "[d27] $(ts) bpftrace absent — using auditd (kill(2) with sig=SIGINT)." | tee -a "$LOG"
  auditctl -a always,exit -F arch=b64 -S kill -F a1=2 -k d27sigint
  echo "[d27] armed. Inspect:  ausearch -k d27sigint" | tee -a "$LOG"
  echo "[d27] REMOVE the rule when done:  auditctl -d always,exit -F arch=b64 -S kill -F a1=2 -k d27sigint" | tee -a "$LOG"
else
  echo "[d27] neither bpftrace nor auditctl present. Install one:  apt-get install -y bpftrace   (then re-run)." | tee -a "$LOG"
  exit 1
fi
