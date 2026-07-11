// Focused E2E for team roster + role enforcement (Slice 1).
// Runs against the real DB using throwaway orgs (cascade-cleaned at the end).
// Exercises the REAL guard (roleChangeError from lib/authz) through a mirror of
// the updateMemberRole write path — the server action itself can't run headless
// because it depends on requireUser(). Proves: promote/demote works, the
// last-admin lockout guard holds, invalid roles are rejected, org scoping is
// enforced, and a user.role_changed audit row is written per successful change.
import { PrismaClient, UserRole } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";
import { roleChangeError } from "../lib/authz.ts";

const prisma = new PrismaClient();

const TAG = "e2e-team-roles";
let ok = 0;
assertTestDatabase(); // abort unless DATABASE_URL targets a *_test database
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// Mirror of updateMemberRole: same org scoping, same no-op short-circuit, same
// guard, same audit write. actorOrgId stands in for the ADMIN actor's org.
async function applyRoleChange(actorOrgId, actorId, targetUserId, newRole) {
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: actorOrgId },
    select: { id: true, name: true, role: true },
  });
  if (target && target.role === newRole) return undefined; // no-op

  const orgAdminCount = await prisma.user.count({
    where: { organizationId: actorOrgId, role: UserRole.ADMIN },
  });
  const err = roleChangeError({
    newRole,
    targetCurrentRole: target?.role ?? UserRole.ADMIN,
    targetIsInOrg: Boolean(target),
    orgAdminCount,
  });
  if (err) return { error: err };

  const previousRole = target.role;
  await prisma.user.update({ where: { id: target.id }, data: { role: newRole } });
  await prisma.activityLog.create({
    data: {
      organizationId: actorOrgId,
      actorId,
      eventType: "user.role_changed",
      eventLabel: `Role: ${previousRole} → ${newRole} for ${target.name}`,
    },
  });
  return undefined;
}

async function seedOrg(slug, adminName, memberName) {
  const org = await prisma.organization.create({ data: { name: TAG, slug } });
  const admin = await prisma.user.create({
    data: { organizationId: org.id, name: adminName, email: `${slug}-admin@example.test`, hashedPassword: "x", role: UserRole.ADMIN },
  });
  const member = await prisma.user.create({
    data: { organizationId: org.id, name: memberName, email: `${slug}-member@example.test`, hashedPassword: "x", role: UserRole.ANALYST },
  });
  return { org, admin, member };
}

const roleOf = (id) => prisma.user.findUnique({ where: { id }, select: { role: true } }).then((u) => u.role);

const orgIds = [];
try {
  console.log("Seeding throwaway org A (1 admin + 1 analyst)...");
  const a = await seedOrg(`${TAG}-${process.pid}-a`, "Ada Admin", "Ann Analyst");
  orgIds.push(a.org.id);
  console.log("Seeding throwaway org B (org-scoping control)...");
  const b = await seedOrg(`${TAG}-${process.pid}-b`, "Bob Admin", "Ben Analyst");
  orgIds.push(b.org.id);

  console.log("\n[1] Promote analyst -> ADMIN:");
  const r1 = await applyRoleChange(a.org.id, a.admin.id, a.member.id, UserRole.ADMIN);
  assert(r1 === undefined && (await roleOf(a.member.id)) === UserRole.ADMIN, "analyst promoted to ADMIN");

  console.log("\n[2] Demote one of two admins (2 -> 1):");
  const r2 = await applyRoleChange(a.org.id, a.admin.id, a.member.id, UserRole.ANALYST);
  const adminCountAfter2 = await prisma.user.count({ where: { organizationId: a.org.id, role: UserRole.ADMIN } });
  assert(r2 === undefined && adminCountAfter2 === 1, "one admin demoted, 1 admin remains");

  console.log("\n[3] Last-admin guard — demote the final ADMIN:");
  const r3 = await applyRoleChange(a.org.id, a.admin.id, a.admin.id, UserRole.ANALYST);
  assert(r3?.error === "Can't remove the last admin.", "final-admin demotion rejected");
  assert((await roleOf(a.admin.id)) === UserRole.ADMIN, "final admin unchanged (still ADMIN)");

  console.log("\n[4] Invalid role string rejected:");
  const r4 = await applyRoleChange(a.org.id, a.admin.id, a.member.id, "SUPERUSER");
  assert(r4?.error === "Invalid role.", "unknown role rejected");

  console.log("\n[5] Org scoping — org A actor targeting an org B member:");
  const r5 = await applyRoleChange(a.org.id, a.admin.id, b.member.id, UserRole.ADMIN);
  assert(r5?.error === "Member not found.", "cross-org target treated as not found");
  assert((await roleOf(b.member.id)) === UserRole.ANALYST, "org B member unchanged");

  console.log("\n[6] Audit trail:");
  const logs = await prisma.activityLog.count({
    where: { organizationId: a.org.id, eventType: "user.role_changed" },
  });
  assert(logs === 2, "exactly 2 user.role_changed entries (promote + demote)");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
