"use server";

import { redirect } from "next/navigation";
import { UserLifecycleState } from "@prisma/client";

import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function loginAction(_: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !verifyPassword(password, user.hashedPassword)) {
    return { error: "Invalid email or password." };
  }

  // Only shown AFTER credentials verify, so it's not credential enumeration.
  if (user.lifecycleState !== UserLifecycleState.ACTIVE) {
    return { error: "This account has been deactivated. Please contact your organization administrator." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}
