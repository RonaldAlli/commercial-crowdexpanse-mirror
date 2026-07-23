// E7 · UI: server-side read assembly — wires the canonical read path (build FactGraph → project) into the pure
// view-model assembly. Observational; the pure assemble*/toRenderProps functions (AC-VM boundary) do the shaping.

import { buildFactGraph } from "@/lib/pipeline-facts";
import { project, SS1 } from "@/lib/pipeline-projection";
import { assemblePipeline, toRenderProps } from "./assemble";
import type { PipelineRenderProps, PipelineViewModel } from "./types";

const VC = { policyVersion: "p1", ruleSetVersion: "rs-1" };
const PROJECTION_POLICY = { projectionVersion: "pp-1" };

export async function readPipeline(input: { organizationId: string; opportunityId: string; activeTab?: string }): Promise<{ pipeline: PipelineViewModel; render: PipelineRenderProps }> {
  const graph = await buildFactGraph({ organizationId: input.organizationId, opportunityId: input.opportunityId, versionContext: VC });
  const projection = project({ spine: SS1, graph, projectionPolicy: PROJECTION_POLICY });
  const pipeline = assemblePipeline({
    opportunityId: input.opportunityId,
    projection,
    orderedFacts: [...graph.history],
    activeIds: new Set(graph.activeFacts.map((f) => f.id)),
    activeTab: input.activeTab,
  });
  return { pipeline, render: toRenderProps(pipeline) };
}
