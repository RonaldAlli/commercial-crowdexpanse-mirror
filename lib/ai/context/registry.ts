import type { ContextProvider } from "./types";
import { sellerProvider } from "./seller";
import { propertyProvider } from "./property";
import { sessionProvider } from "./session";
import { timelineProvider } from "./timeline";
import { communicationsProvider } from "./communications";
import { scoringProvider } from "./scoring";

// Ordered provider set for the `acquisition` consumer. Keyed by `provider.key` so
// the Workspace Brain (Slice 3) can select a subset per intent.
export const ACQUISITION_PROVIDERS: readonly ContextProvider[] = [
  sellerProvider,
  propertyProvider,
  sessionProvider,
  timelineProvider,
  communicationsProvider,
  scoringProvider,
];

// Resolves a list of provider keys to providers, preserving registry order,
// de-duplicating, and silently ignoring unknown keys.
export function providersByKeys(keys: readonly string[]): ContextProvider[] {
  const wanted = new Set(keys);
  return ACQUISITION_PROVIDERS.filter((p) => wanted.has(p.key));
}
