import { PipelineBoard } from "@/components/pipeline-board";
import { PageHeader } from "@/components/page-header";

export default function OpportunitiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Opportunity pipeline"
        title="Pipeline"
        description="Commercial acquisition stages from lead through paid."
        actions={<button className="btn-primary">New opportunity</button>}
      />
      <PipelineBoard />
    </div>
  );
}
