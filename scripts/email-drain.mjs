// Manual outbox drain — re-attempts undelivered EmailMessage rows (PENDING /
// FAILED with attempts remaining). This is the target a future cron will call;
// it is intentionally NOT scheduled in Slice 3d-i.
//
// NOTE: durable re-send requires a per-kind ResendResolver (rebuilds the message
// from the source of truth, so no body/token is ever stored). Until feature
// resolvers are registered (3d-ii onward), rows are reported as "unresolved" and
// left untouched — nothing is silently dropped.
//
// Usage: node scripts/email-drain.mjs [limit]
import { messageService } from "../lib/email/index.ts";
import { prisma } from "../lib/prisma.ts";

const limit = Number.parseInt(process.argv[2] ?? "50", 10);

try {
  const result = await messageService.drain({ limit: Number.isInteger(limit) ? limit : 50 });
  console.log(
    `[email-drain] attempted=${result.attempted} sent=${result.sent} ` +
      `failed=${result.failed} unresolved=${result.unresolved}`,
  );
} finally {
  await prisma.$disconnect();
}
