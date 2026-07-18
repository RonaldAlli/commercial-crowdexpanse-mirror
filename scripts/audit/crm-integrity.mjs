// Read-only CRM + platform data-integrity audit (roadmap restoration, Wave 1).
//
// Packages the ad-hoc integrity checks used during the restoration discovery into a repeatable,
// repository-managed, READ-ONLY script. It runs ONLY SELECT/count queries — it never UPDATE/
// DELETE/INSERTs. It requires an explicit DATABASE_URL (fail closed if absent), prints violation
// COUNTS only (no record contents), and exits NONZERO if any violation is found — so it can gate
// CI or a pre-deploy check. Safe to run against production (read-only) after reviewing the queries.
//
// Usage:  DATABASE_URL=postgres://…  node scripts/audit/crm-integrity.mjs
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("[crm-integrity] DATABASE_URL is required (read-only). Refusing to run without it.");
  process.exit(2);
}

const prisma = new PrismaClient();
const violations = [];
function check(name, count, expectZero = true) {
  const bad = expectZero ? count !== 0 : count === 0;
  console.log(`  ${bad ? "✗" : "✓"} ${name}: ${count}`);
  if (bad) violations.push(`${name} = ${count}`);
}

try {
  const q = (sql) => prisma.$queryRawUnsafe(sql);

  console.log("Owner Contacts:");
  check("missing organizationId", (await q(`SELECT count(*)::int n FROM owner_contacts WHERE "organizationId" IS NULL`))[0].n);
  check("orphan (missing ownerId)", (await q(`SELECT count(*)::int n FROM owner_contacts WHERE "ownerId" IS NULL`))[0].n);
  check("owner cross-org mismatch", (await q(`SELECT count(*)::int n FROM owner_contacts c JOIN owners o ON o.id=c."ownerId" WHERE o."organizationId" <> c."organizationId"`))[0].n);
  check("owners with >1 primary contact", (await q(`SELECT count(*)::int n FROM (SELECT "ownerId" FROM owner_contacts WHERE "isPrimary"=true GROUP BY "ownerId" HAVING count(*)>1) d`))[0].n);
  check("assignee orphan FK", (await q(`SELECT count(*)::int n FROM owner_contacts c WHERE c."assignedUserId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=c."assignedUserId")`))[0].n);
  check("assignee cross-org", (await q(`SELECT count(*)::int n FROM owner_contacts c JOIN users u ON u.id=c."assignedUserId" WHERE u."organizationId" <> c."organizationId"`))[0].n);

  console.log("Opportunity Diligence:");
  check("missing organizationId", (await q(`SELECT count(*)::int n FROM opportunity_diligence_items WHERE "organizationId" IS NULL`))[0].n);
  check("orphan (missing opportunityId)", (await q(`SELECT count(*)::int n FROM opportunity_diligence_items WHERE "opportunityId" IS NULL`))[0].n);
  check("opportunity cross-org mismatch", (await q(`SELECT count(*)::int n FROM opportunity_diligence_items d JOIN opportunities o ON o.id=d."opportunityId" WHERE o."organizationId" <> d."organizationId"`))[0].n);

  console.log("Contact Touches:");
  check("missing organizationId", (await q(`SELECT count(*)::int n FROM contact_touches WHERE "organizationId" IS NULL`))[0].n);

  console.log("Automation (must remain empty while paused):");
  check("automation_jobs rows", (await q(`SELECT count(*)::int n FROM automation_jobs`))[0].n);
  check("automation_executions rows", (await q(`SELECT count(*)::int n FROM automation_executions`))[0].n);

  console.log("Migrations:");
  check("unfinished migrations", (await q(`SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NULL`))[0].n);
  check("rolled-back migrations", (await q(`SELECT count(*)::int n FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL`))[0].n);
  check("applied migrations (expect 30)", (await q(`SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL`))[0].n, false); // expect non-zero
} catch (e) {
  console.error("[crm-integrity] query error:", e.message);
  await prisma.$disconnect();
  process.exit(2);
}

await prisma.$disconnect();
if (violations.length) {
  console.log(`\nFAIL — ${violations.length} integrity violation(s):`);
  for (const v of violations) console.log(`  - ${v}`);
  process.exit(1);
}
console.log("\nPASS — no CRM/platform data-integrity violations.");
