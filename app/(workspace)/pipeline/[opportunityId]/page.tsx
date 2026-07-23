// E7 · the Pipeline screen (server component). Reads the pipeline view model server-side (build FactGraph →
// project → assemble) and hands the stable render props to the boring client renderer. UI is a consumer of the
// frozen contracts (UI-INV-1). One complete screen: Projection · Activity · Decision Timeline · Validation ·
// Authorization · Fact Operations.
import { readPipeline } from "@/lib/pipeline-view-models";

import { PipelinePanels } from "./PipelinePanels";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: { opportunityId: string };
  searchParams: { org?: string; tab?: string };
}) {
  const organizationId = searchParams.org ?? "";
  const { render } = await readPipeline({ organizationId, opportunityId: params.opportunityId, activeTab: searchParams.tab });
  return <PipelinePanels render={render} />;
}
