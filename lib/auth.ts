import crypto from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { UserLifecycleState, type UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/authz";

const SESSION_COOKIE = "ce_commercial_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not configured (needs at least 16 characters).");
  }
  return secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

type SessionToken = {
  userId: string;
  issuedAt: number;
};

export async function createSession(userId: string) {
  const issuedAt = Date.now().toString();
  const payload = `${userId}.${issuedAt}`;
  const token = `${payload}.${sign(payload)}`;

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

/** Parse + verify the signed cookie. Does not touch the database. */
export function readSessionToken(): SessionToken | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const segments = raw.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const [userId, issuedAt, signature] = segments;
  if (!userId || !issuedAt || !signature) {
    return null;
  }

  if (!safeEqual(sign(`${userId}.${issuedAt}`), signature)) {
    return null;
  }

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return null;
  }

  if (Date.now() - issuedAtMs > SESSION_TTL_SECONDS * 1000) {
    return null;
  }

  return { userId, issuedAt: issuedAtMs };
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

/** Resolve the signed session to a live user record, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = readSessionToken();
  if (!token) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    include: { organization: true },
  });

  if (!user) {
    return null;
  }

  // Only ACTIVE accounts have a live session. A deactivated (or future
  // suspended) user is rejected on their very next request — the DB is checked
  // every time, so there is no stateless bypass.
  if (user.lifecycleState !== UserLifecycleState.ACTIVE) {
    return null;
  }

  // Session epoch: reject any cookie issued before sessionsValidAfter. Set on
  // deactivation, this invalidates all previously-issued cookies at once — and
  // reactivation deliberately leaves it in place, so only newly-issued sessions
  // (issuedAt > sessionsValidAfter) are valid; the old cookie stays dead.
  if (user.sessionsValidAfter && token.issuedAt < user.sessionsValidAfter.getTime()) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
    organizationSlug: user.organization.slug,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Require an authenticated user holding one of the given roles. Unauthenticated
 * callers are sent to /login; authenticated-but-unauthorized callers get a 404
 * (notFound) rather than a redirect — consistent with the cross-org "pretend it
 * doesn't exist" pattern, so restricted surfaces aren't disclosed.
 */
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, ...roles)) {
    notFound();
  }
  return user;
}
