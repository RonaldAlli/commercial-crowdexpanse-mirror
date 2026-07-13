// Zero-dependency structured telemetry for performance instrumentation (PQ-3).
//
// STRICTLY OBSERVATIONAL — this module only measures and logs; it never changes
// query behavior. It is dormant in production by default: logging is gated on
// dev or an explicit INSTRUMENT=1 flag, so production stays quiet unless someone
// intentionally enables it. Not wired into the always-on request path — used by
// the perf harness and available for opt-in timing.

/** True when timing logs should be emitted (dev, or explicit opt-in). */
export function instrumentEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.INSTRUMENT === "1";
}

export interface TelemetryEvent {
  evt: string;
  label: string;
  ms?: number;
  meta?: Record<string, unknown>;
}

/** Emit one structured JSON line to stdout (only when instrumentation is on). */
export function logEvent(event: TelemetryEvent): void {
  if (!instrumentEnabled()) return;
  // One line, machine-parseable; PM2/stdout captures it. No secrets ever logged.
  process.stdout.write(JSON.stringify({ t: "telemetry", ...event }) + "\n");
}

/**
 * Time an async function, log the duration, and return its result UNCHANGED.
 * The identity guarantee is load-bearing: instrumentation must never alter the
 * value or the control flow of the code it wraps.
 */
export async function withTiming<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logEvent({ evt: "timing", label, ms: round(performance.now() - start), meta });
  }
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export interface Percentiles {
  count: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

/** Summary statistics over a set of durations (ms). Nearest-rank percentiles. */
export function percentiles(samples: number[]): Percentiles {
  if (samples.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => {
    // Nearest-rank: rank = ceil(p * n), 1-indexed, clamped.
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
  };
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    min: round(sorted[0]),
    p50: round(at(50)),
    p95: round(at(95)),
    p99: round(at(99)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
  };
}
