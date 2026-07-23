// E7 · UI view models public surface. Pure assembly of frozen contracts → domain VMs → PipelineViewModel →
// stable render props (UI-INV-1..5). React components consume the presentation view model, never a subsystem object.
export * from "./types";
export * from "./assemble";
export { readPipeline } from "./read";
