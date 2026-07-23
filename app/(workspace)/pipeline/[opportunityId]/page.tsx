// E7 · the Pipeline screen (server component). Reads the pipeline view model server-side (build FactGraph →
// project → assemble) and hands the stable render props to the boring client renderer. UI is a consumer of the
// frozen contracts (UI-INV-1). One complete screen: Projection · Activity · Decision Timeline · Validation ·
// Authorization · Fact Operations.
//
// Tenant scope is SESSION-AUTHORITATIVE (resolveOwnedPipelineScope): the organization is derived from the
// authenticated user, never from a search param. A cross-tenant or unknown opportunity is notFound() (404) —
// tenant existence is never disclosed.
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { resolveOwnedPipelineScope } from "@/lib/pipeline-tenant";
import { readPipeline } from "@/lib/pipeline-view-models";

import { PipelinePanels } from "./PipelinePanels";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: { opportunityId: string };
  searchParams: { tab?: string };
}) {
  const user = await requireUser();
  const scope = await resolveOwnedPipelineScope(user, params.opportunityId);
  if (!scope) {
    notFound();
  }
  const { render } = await readPipeline({ organizationId: scope.organizationId, opportunityId: scope.opportunityId, activeTab: searchParams.tab });
  return <PipelinePanels render={render} />;
}
