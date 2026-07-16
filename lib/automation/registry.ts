// The Automation runtime registry (Phase 2.0.1). Maps automationType → handler (executor)
// and → seeder (scheduler). Populated in Commit 6 with the read-only closing-readiness proof
// job. Kept empty here so the runtime is inert until a real, approved automation is wired.
// Importing this module has no side effects.

import type { HandlerRegistry } from "./executor";
import type { SeederRegistry } from "./scheduler";

export const handlers: HandlerRegistry = {};
export const seeders: SeederRegistry = {};
