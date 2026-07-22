// E4 · Projection public surface. Derives operational presentation state by observing active Decision Facts
// (PR-INV-10). Observational + disposable (Law 4/8); never mutates/evaluates/authorizes (PR-INV-1..10).
export * from "./types";
export { project } from "./project";
export { getStageSpine, SS1 } from "./spine";
