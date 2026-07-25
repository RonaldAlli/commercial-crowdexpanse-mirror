// Retrieval — selects the providers for an intent, loads them in parallel, drops
// the ones with nothing to contribute, and enforces the org boundary via the anchor.
// Deterministic orchestration only.

import type { ContextFragment, ContextProvider, ProviderCtx } from "@/lib/ai/context/types";
import { providersByKeys } from "@/lib/ai/context/registry";

// Thrown when the seller anchor is absent — i.e. the subject is not in the caller's
// organization (or does not exist). The route (Slice 4) maps this to a 404.
export class CopilotNotFoundError extends Error {
  constructor(message = "Subject not found in the caller's organization") {
    super(message);
    this.name = "CopilotNotFoundError";
  }
}

// `providers` is injectable for testing; in production it resolves from the registry.
export async function retrieve(
  providerKeys: string[],
  ctx: ProviderCtx,
  providers: ContextProvider[] = providersByKeys(providerKeys),
): Promise<ContextFragment[]> {
  const loaded = await Promise.all(providers.map((p) => p.load(ctx)));
  const fragments = loaded.filter((f): f is ContextFragment => f !== null);
  // The seller provider is the anchor: a null seller fragment means the subject is
  // cross-org / missing. Fail closed with NotFound rather than answering ungrounded.
  if (!fragments.some((f) => f.key === "seller")) {
    throw new CopilotNotFoundError();
  }
  return fragments;
}
