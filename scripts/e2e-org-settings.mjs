// Focused E2E for organization settings (Slice 3c).
// Runs against the *_test DB with throwaway orgs (cascade-cleaned). Uses the
// REAL lib/org-settings (get-or-create, validation) + lib/permissions matrix,
// and mirrors the saveOrganizationSettings / createInvite write paths (the
// server actions can't run headless: requireUser). Proves: lazy defaults,
// creation, expiry + default-role configuration, ADMIN-default rejection, bounds
// validation, rename, org scoping, permission denial, audit, invite integration.
import { UserRole } from "@prisma/client";
import { assertTestDatabase } from "./e2e-guard.mjs";

import { prisma } from "../lib/prisma.ts";
import { can } from "../lib/permissions.ts";
import { getOrgSettings, orgSettingsError, updateOrgSettings } from "../lib/org-settings.ts";
import { generateInviteToken, hashInviteToken, inviteExpiry } from "../lib/invitations.ts";

const { ADMIN, ACQUISITIONS, ANALYST, DISPOSITIONS } = UserRole;
const TAG = "e2e-org-settings";
let ok = 0;
assertTestDatabase();
const fail = [];
function assert(cond, msg) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fail.push(msg); console.log(`  ✗ ${msg}`); }
}

// Mirror of saveOrganizationSettings: validate, rename-if-changed (+audit),
// settings-update-if-changed (+audit). Returns { error } or undefined.
async function mirrorSave(actor, { name, inviteExpiryDays, defaultInviteRole }) {
  if (!name?.trim()) return { error: "Organization name is required." };
  const err = orgSettingsError({ inviteExpiryDays, defaultInviteRole });
  if (err) return { error: err };
  const org = await prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { name: true } });
  const current = await getOrgSettings(actor.organizationId);
  if (org && org.name !== name) {
    await prisma.organization.update({ where: { id: actor.organizationId }, data: { name } });
    await prisma.activityLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, eventType: "organization.renamed", eventLabel: `Organization renamed: ${org.name} → ${name}` } });
  }
  if (current.inviteExpiryDays !== inviteExpiryDays || current.defaultInviteRole !== defaultInviteRole) {
    await updateOrgSettings(actor.organizationId, { inviteExpiryDays, defaultInviteRole });
    await prisma.activityLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, eventType: "organization.settings_updated", eventLabel: `Updated org settings: ${inviteExpiryDays}d / ${defaultInviteRole}` } });
  }
  return undefined;
}

// Mirror of createInvite's settings integration (expiry + default role fallback).
async function mirrorCreateInvite(orgId, actorId, email, role) {
  const settings = await getOrgSettings(orgId);
  const effectiveRole = role || settings.defaultInviteRole;
  const now = Date.now();
  const raw = generateInviteToken();
  const invite = await prisma.invitation.create({
    data: {
      organizationId: orgId, email, role: effectiveRole,
      tokenHash: hashInviteToken(raw), status: "PENDING",
      expiresAt: inviteExpiry(now, settings.inviteExpiryDays), invitedById: actorId,
    },
  });
  return { invite, expectedExpiry: now + settings.inviteExpiryDays * 24 * 60 * 60 * 1000 };
}

// ── Part A: pure policy + validation (no DB) ────────────────────────────────
console.log("[A] Pure — orgSettingsError():");
assert(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: ACQUISITIONS }) === null, "valid (7 days, ACQUISITIONS) accepted");
assert(orgSettingsError({ inviteExpiryDays: 1, defaultInviteRole: ANALYST }) === null, "min bound (1 day) accepted");
assert(orgSettingsError({ inviteExpiryDays: 90, defaultInviteRole: DISPOSITIONS }) === null, "max bound (90 days) accepted");
assert(orgSettingsError({ inviteExpiryDays: 0, defaultInviteRole: ANALYST }) !== null, "expiry 0 rejected (below min)");
assert(orgSettingsError({ inviteExpiryDays: 91, defaultInviteRole: ANALYST }) !== null, "expiry 91 rejected (above max)");
assert(orgSettingsError({ inviteExpiryDays: 3.5, defaultInviteRole: ANALYST }) !== null, "non-integer expiry rejected");
assert(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: ADMIN }) === "Admin can't be the default invitation role.", "ADMIN default role rejected");
assert(orgSettingsError({ inviteExpiryDays: 7, defaultInviteRole: "SUPERUSER" }) === "Invalid default role.", "unknown default role rejected");

console.log("\n[A] Pure — ORGANIZATION permission matrix:");
assert(can(ADMIN, "MANAGE", "ORGANIZATION") === true, "ADMIN may MANAGE ORGANIZATION");
for (const role of [ACQUISITIONS, ANALYST, DISPOSITIONS]) {
  assert(can(role, "MANAGE", "ORGANIZATION") === false, `${role} may NOT MANAGE ORGANIZATION`);
}

// ── Part B: DB-backed ───────────────────────────────────────────────────────
const orgIds = [];
try {
  console.log("\n[B] Seeding org A + org B (scoping control)...");
  const a = await prisma.organization.create({ data: { name: "Org A", slug: `${TAG}-${process.pid}-a` } });
  orgIds.push(a.id);
  const adminA = await prisma.user.create({ data: { organizationId: a.id, name: "Ada", email: `${TAG}-${process.pid}-a@example.test`, hashedPassword: "x", role: ADMIN } });
  const b = await prisma.organization.create({ data: { name: "Org B", slug: `${TAG}-${process.pid}-b` } });
  orgIds.push(b.id);

  console.log("\n[B1] Lazy get-or-create yields schema defaults:");
  const s1 = await getOrgSettings(a.id);
  assert(s1.inviteExpiryDays === 7 && s1.defaultInviteRole === ACQUISITIONS, "settings-less org gets defaults (7 days, ACQUISITIONS)");
  assert((await prisma.organizationSettings.count({ where: { organizationId: a.id } })) === 1, "exactly one settings row created");

  console.log("\n[B2] get-or-create is idempotent (no duplicate row):");
  const s2 = await getOrgSettings(a.id);
  assert(s2.id === s1.id && (await prisma.organizationSettings.count({ where: { organizationId: a.id } })) === 1, "second read returns the same row");

  console.log("\n[B3] Save settings (expiry + default role) + audit:");
  const r3 = await mirrorSave({ id: adminA.id, organizationId: a.id, role: ADMIN }, { name: "Org A", inviteExpiryDays: 14, defaultInviteRole: ANALYST });
  const s3 = await getOrgSettings(a.id);
  assert(r3 === undefined && s3.inviteExpiryDays === 14 && s3.defaultInviteRole === ANALYST, "settings updated to 14 days / ANALYST");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "organization.settings_updated" } })) === 1, "one organization.settings_updated audit row");

  console.log("\n[B4] Org scoping — org B unaffected:");
  const sB = await getOrgSettings(b.id);
  assert(sB.inviteExpiryDays === 7 && sB.defaultInviteRole === ACQUISITIONS, "org B keeps its own defaults");

  console.log("\n[B5] Invitation integration — configured expiry + default role applied:");
  const { invite, expectedExpiry } = await mirrorCreateInvite(a.id, adminA.id, `${TAG}-${process.pid}-invitee@example.test`, ""); // empty role → org default
  assert(invite.role === ANALYST, "invite with no explicit role uses the org default (ANALYST)");
  assert(Math.abs(invite.expiresAt.getTime() - expectedExpiry) < 5000, "invite expiry reflects the configured 14-day window");

  console.log("\n[B6] Rename organization + audit:");
  const r6 = await mirrorSave({ id: adminA.id, organizationId: a.id, role: ADMIN }, { name: "Org A Renamed", inviteExpiryDays: 14, defaultInviteRole: ANALYST });
  const orgAfter = await prisma.organization.findUnique({ where: { id: a.id }, select: { name: true } });
  assert(r6 === undefined && orgAfter.name === "Org A Renamed", "organization name updated");
  assert((await prisma.activityLog.count({ where: { organizationId: a.id, eventType: "organization.renamed" } })) === 1, "one organization.renamed audit row");

  console.log("\n[B7] ADMIN-default save rejected; settings unchanged:");
  const r7 = await mirrorSave({ id: adminA.id, organizationId: a.id, role: ADMIN }, { name: "Org A Renamed", inviteExpiryDays: 30, defaultInviteRole: ADMIN });
  const s7 = await getOrgSettings(a.id);
  assert(r7?.error === "Admin can't be the default invitation role.", "save with ADMIN default rejected");
  assert(s7.inviteExpiryDays === 14 && s7.defaultInviteRole === ANALYST, "settings unchanged after rejected save");

  console.log("\n[B8] Audit is org-scoped — org B has no settings/rename events:");
  assert((await prisma.activityLog.count({ where: { organizationId: b.id, eventType: { in: ["organization.settings_updated", "organization.renamed"] } } })) === 0, "org B saw none of org A's org events");
} finally {
  console.log("\nCleaning up throwaway orgs (cascade)...");
  for (const id of orgIds) {
    await prisma.organization.delete({ where: { id } }).catch((e) => console.log(`  cleanup warn: ${e.message}`));
  }
  await prisma.$disconnect();
}

console.log(`\n${fail.length === 0 ? "PASS" : "FAIL"} — ${ok} assertions passed, ${fail.length} failed`);
if (fail.length) { for (const f of fail) console.log(`  - ${f}`); process.exit(1); }
