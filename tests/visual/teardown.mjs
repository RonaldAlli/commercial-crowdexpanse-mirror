// Visual-fixture teardown — cascade-deletes every throwaway `e2e-visual` org from the _test
// DB and removes the auth storageState artifacts. Safe to run repeatedly; guarded to _test.
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertTestDatabase } from "../../scripts/e2e-guard.mjs";
import { prisma } from "../../lib/prisma.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

assertTestDatabase();

const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: "e2e-visual" } }, select: { id: true, slug: true } });
for (const o of orgs) {
  await prisma.organization.delete({ where: { id: o.id } }).catch((e) => console.log(`  cleanup warn ${o.slug}: ${e.message}`));
}
console.log(`[visual-teardown] removed ${orgs.length} throwaway org(s)`);
rmSync(join(HERE, ".artifacts", "auth"), { recursive: true, force: true });
await prisma.$disconnect();
