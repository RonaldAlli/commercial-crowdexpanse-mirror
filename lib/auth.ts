import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
