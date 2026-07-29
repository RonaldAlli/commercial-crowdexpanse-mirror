// CRE Operating Workspace — UI Milestone 1, Increment 1: NON-PRODUCTION demonstration surface.
//
// Renders the Increment-1 presentation primitives with static fixtures for review and accessibility
// inspection. It is gated OFF by default and only renders when ENABLE_UI_DEV_PREVIEW="1" — it is never
// available in a normal production deploy. It reads NO seller/opportunity data and requires NO backend
// capability; the only external symbol it uses is the pure `can(...)` permission matrix, to demonstrate
// role-aware nav presentation.

import { notFound } from "next/navigation";

import { can, type Resource } from "@/lib/permissions";
import { PageHeader } from "@/components/workspace-ui/PageHeader";
import { WorkspaceSection } from "@/components/workspace-ui/WorkspaceSection";
import { TaxonomyBadge } from "@/components/workspace-ui/TaxonomyBadge";
import { MissingInfoBadge } from "@/components/workspace-ui/MissingInfoBadge";
import { EvidenceChain } from "@/components/workspace-ui/EvidenceChain";
import { RoleAwareNav } from "@/components/workspace-ui/RoleAwareNav";
import { StateBlock } from "@/components/workspace-ui/StateBlock";
import { ELEMENT_KINDS } from "@/lib/workspace-ui/taxonomy";
import { MISSING_INFO_STATES } from "@/lib/workspace-ui/missing-info";
import { PRESENTATION_STATES } from "@/lib/workspace-ui/presentation-states";
import type { WorkspaceNavItem } from "@/lib/workspace-ui/nav";
import type { EvidenceChainInput } from "@/lib/workspace-ui/evidence";

const NAV_ITEMS: WorkspaceNavItem[] = [
  { href: "/dashboard", label: "Command Center", iconName: "dashboard", section: "Milestone 1", availability: "available" },
  { href: "/acquire", label: "Seller Work Queue", iconName: "phone", section: "Milestone 1", availability: "available", requires: "SELLER" },
  { href: "/opportunities", label: "Opportunity Workspace", iconName: "pipeline", section: "Milestone 1", availability: "available", requires: "OPPORTUNITY" },
  { href: "/analyzer", label: "Guided Underwriting", iconName: "analyzer", section: "Future", availability: "future" },
  { href: "/matches", label: "Buyer Matching", iconName: "spark", section: "Future", availability: "future" },
  { href: "/closing", label: "Closing", iconName: "check", section: "Future", availability: "future" },
];

const CHAIN_COMPLETE: EvidenceChainInput = {
  recommendation: "Promote this seller to an opportunity",
  supporting: [
    { label: "Qualification checklist complete (5/5)", present: true },
    { label: "Outreach status is Qualified", present: true },
  ],
  missing: [],
  confidence: "high",
  nextAction: { label: "Promote to opportunity" },
};

const CHAIN_PARTIAL: EvidenceChainInput = {
  recommendation: "Continue qualifying this seller",
  supporting: [
    { label: "Contact made", present: true },
    { label: "Motivation captured", present: false },
  ],
  missing: ["Property linked", "Preferred contact method"],
  confidence: "low",
  nextAction: { label: "Capture motivation" },
};

const CHAIN_UNCERTAIN: EvidenceChainInput = {
  recommendation: null,
  supporting: [{ label: "Owner name on file", present: true }],
  missing: ["Phone number", "Contact attempt"],
  confidence: null,
  nextAction: { review: true },
};

export default function UiPrimitivesPreviewPage() {
  if (process.env.ENABLE_UI_DEV_PREVIEW !== "1") notFound();

  const permit = (resource: string) => can("ACQUISITIONS", "READ", resource as Resource);

  return (
    <div className="space-y-6">
      <PageHeader
        title="UI primitives — development preview"
        description="Non-production. Increment 1 presentation primitives rendered with static fixtures. No seller or opportunity data is read."
      />

      <WorkspaceSection title="Element taxonomy (Observed / Computed / Recommended)" id="sec-taxonomy">
        <div className="flex flex-wrap gap-2">
          {ELEMENT_KINDS.map((k) => (
            <TaxonomyBadge key={k} kind={k} />
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Missing-information states (four distinct)" id="sec-missing">
        <div className="flex flex-wrap gap-2">
          {MISSING_INFO_STATES.map((s) => (
            <MissingInfoBadge key={s} state={s} />
          ))}
          <MissingInfoBadge state="missing" detail="rent roll" />
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Evidence chain — complete" id="sec-evidence-complete">
        <EvidenceChain chain={CHAIN_COMPLETE} headingId="sec-evidence-complete" />
      </WorkspaceSection>
      <WorkspaceSection title="Evidence chain — partial (missing facts marked)" id="sec-evidence-partial">
        <EvidenceChain chain={CHAIN_PARTIAL} headingId="sec-evidence-partial" />
      </WorkspaceSection>
      <WorkspaceSection title="Evidence chain — uncertain (no recommendation, not scored, review)" id="sec-evidence-uncertain">
        <EvidenceChain chain={CHAIN_UNCERTAIN} headingId="sec-evidence-uncertain" />
      </WorkspaceSection>

      <WorkspaceSection
        title="Role-aware navigation (future items marked unavailable)"
        id="sec-nav"
        secondary={<p className="text-xs text-slate-500">Future workspaces render as &ldquo;Soon&rdquo; and are not links.</p>}
      >
        <RoleAwareNav items={NAV_ITEMS} permit={permit} activeHref="/dashboard" />
      </WorkspaceSection>

      <WorkspaceSection title="Presentation states (loading / empty / unavailable / error)" id="sec-states">
        <div className="grid gap-4 sm:grid-cols-2">
          {PRESENTATION_STATES.map((s) => (
            <StateBlock key={s} state={s} />
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
}
