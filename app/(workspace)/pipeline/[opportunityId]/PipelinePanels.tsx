"use client";

// E7 · the (intentionally boring) Pipeline renderer. Consumes an immutable PipelineRenderProps (presentation view
// model → props) and renders it. No business logic, no subsystem objects, no reinterpretation (UI-INV-1/2/5).
import type { PipelineRenderProps } from "@/lib/pipeline-view-models";

export function PipelinePanels({ render }: { render: PipelineRenderProps }) {
  return (
    <div className="pipeline-screen">
      <header>
        <h1>Pipeline · {render.opportunityId}</h1>
        <p>
          Stage: <strong>{render.headline.stage}</strong> · {render.headline.completeness}
        </p>
        <nav aria-label="pipeline tabs">
          {render.navigation.tabs.map((tab) => (
            <span key={tab} style={{ marginRight: 12, fontWeight: tab === render.navigation.activeTab ? 700 : 400 }}>
              {tab}
            </span>
          ))}
        </nav>
      </header>
      {render.panels.map((panel) => (
        <section key={panel.key} aria-label={panel.title}>
          <h2>{panel.title}</h2>
          {panel.items.length === 0 ? (
            <p>—</p>
          ) : (
            <ul>
              {panel.items.map((item, i) => (
                <li key={`${panel.key}-${i}`}>
                  <span>{item.label}</span>: <span>{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
