// E6 · API public surface. A transport/orchestration layer over the canonical subsystems (API-INV-1). The write
// Coordinator commits transaction-scoped + race-safe (API-INV-2), side-effect-free before commit (API-INV-3), with
// transport idempotency. HTTP routes are thin adapters over `perform`.
export * from "./types";
export { perform } from "./coordinator";
export type { PerformOptions } from "./coordinator";
export { translateDenied, staleError } from "./errors";
