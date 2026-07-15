// Commercial Intelligence (v1.2, Commit 2a-i) — entity projector registry.
//
// A DISPATCH TABLE ONLY. Maps each IntelligenceEntityType to the entity-specific
// hooks the shared refresh/projection substrate needs: resolve the target row,
// test whether a fieldKey is projected, and recompute one projected field from
// the ledger. This is the seam that lets the generic 1b/1c substrate serve more
// than one entity (Owner today; Property next) without an `if (entityType ===)`
// ladder inside the orchestrator.
//
// INVARIANT (locked, Slice 2): this registry is a lookup table, NEVER a strategy
// engine. Each entry only *delegates* to that entity's own projector / adapter /
// domain service (e.g. OWNER → recomputeOwnerField). It holds no business rules
// and no per-entity branching inside a hook. If a hook ever needs an
// `if (entityType === ...)`, that logic belongs in the entity's module, not here.
//
// RULE (do not weaken): "The registry is responsible only for dispatch. It never
// owns entity-specific business logic. Register existing domain behavior; do not
// implement behavior inside the registry." Adding an entity = registering the
// entity's already-existing projector/adapter/domain functions here — never
// writing new behavior in this file.
//
// The map is typed `Record<IntelligenceEntityType, EntityProjector>`, so the
// compiler REQUIRES an entry for every enum member: a new entity cannot be added
// to the Prisma enum without registering its projector here.
import type { IntelligenceEntityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isOwnerProjectedField, type OwnerProjectedField } from "@/lib/intelligence/owner-fields";
import { recomputeOwnerField } from "@/lib/intelligence/projection";
import { isPropertyProjectedField, type PropertyProjectedField } from "@/lib/intelligence/property-fields";
import { recomputePropertyField } from "@/lib/intelligence/property-projection";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The per-entity hooks the shared substrate dispatches to. Delegation only —
 * every implementation forwards to entity-specific logic; none contains rules.
 */
export interface EntityProjector {
  /** Resolve the target row, org-scoped (existence check). Null if not in the org. */
  resolveTarget(db: Db, organizationId: string, entityId: string): Promise<{ id: string } | null>;
  /** Is `fieldKey` a ledger-projected field for this entity? */
  isProjectedField(fieldKey: string): boolean;
  /** Recompute one projected field from the ledger (writes the typed column). */
  recomputeField(db: Db, organizationId: string, entityId: string, fieldKey: string): Promise<void>;
}

export const ENTITY_PROJECTORS: Record<IntelligenceEntityType, EntityProjector> = {
  OWNER: {
    resolveTarget: (db, organizationId, entityId) =>
      db.owner.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    isProjectedField: isOwnerProjectedField,
    recomputeField: async (db, organizationId, entityId, fieldKey) => {
      await recomputeOwnerField(organizationId, entityId, fieldKey as OwnerProjectedField, db);
    },
  },
  PROPERTY: {
    resolveTarget: (db, organizationId, entityId) =>
      db.property.findFirst({ where: { id: entityId, organizationId }, select: { id: true } }),
    isProjectedField: isPropertyProjectedField,
    recomputeField: async (db, organizationId, entityId, fieldKey) => {
      await recomputePropertyField(organizationId, entityId, fieldKey as PropertyProjectedField, db);
    },
  },
};

/** Look up an entity's projector. Returns null for an unregistered type. */
export function getProjector(entityType: IntelligenceEntityType): EntityProjector | null {
  return ENTITY_PROJECTORS[entityType] ?? null;
}
