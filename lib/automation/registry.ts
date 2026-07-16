// The Automation runtime registry (Phase 2.0.1). Maps automationType → handler (executor)
// and → seeder (scheduler). Wired in Commit 6 with the single read-only closing-readiness
// proof job — the ONLY automation approved for 2.0.1. Every entry here is harmless: it reads
// the shared closing projection and produces no domain effect. Importing this module has no
// side effects (the handler/seeder are inert until the executor/scheduler are explicitly run).

import type { HandlerRegistry } from "./executor";
import type { SeederRegistry } from "./scheduler";
import {
  CLOSING_READINESS_AUTOMATION_TYPE,
  closingReadinessHandler,
  closingReadinessSeeder,
} from "./proof-observer";

export const handlers: HandlerRegistry = {
  [CLOSING_READINESS_AUTOMATION_TYPE]: closingReadinessHandler,
};

export const seeders: SeederRegistry = {
  [CLOSING_READINESS_AUTOMATION_TYPE]: closingReadinessSeeder,
};
