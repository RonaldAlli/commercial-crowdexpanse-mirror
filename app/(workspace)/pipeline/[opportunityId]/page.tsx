// E7 · Pipeline screen — DISABLED FOR LAUNCH.
//
// The Slice-2 pipeline is dormant and unlinked; it is not part of the launch workflow. The screen is
// gated (notFound) until the pipeline is activated (the Opportunity Pipeline Migration Initiative).
// The view-model assembly + PipelinePanels remain in the tree for that work; only the reachable route
// is closed, so no half-built pipeline UI is exposed at launch.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  notFound();
}
