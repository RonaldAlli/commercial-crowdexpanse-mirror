"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SellerFormState = { error?: string } | undefined;

function parseSeller(formData: FormData) {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: value("name"),
    company: value("company"),
    email: value("email"),
    phone: value("phone"),
    city: value("city"),
    state: value("state"),
    motivation: value("motivation"),
  };
}

function orNull(value: string) {
  return value.length ? value : null;
}

export async function createSeller(
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const user = await requireUser();
  const data = parseSeller(formData);

  if (!data.name) {
    return { error: "Seller name is required." };
  }

  const seller = await prisma.seller.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      city: orNull(data.city),
      state: orNull(data.state),
      motivation: orNull(data.motivation),
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      sellerId: seller.id,
      actorId: user.id,
      eventType: "seller.created",
      eventLabel: `Seller added: ${seller.name}`,
      eventBody: data.company ? `${seller.name} · ${data.company}` : null,
    },
  });

  revalidatePath("/sellers");
  revalidatePath("/dashboard");
  redirect(`/sellers/${seller.id}`);
}

export async function updateSeller(
  id: string,
  _prev: SellerFormState,
  formData: FormData,
): Promise<SellerFormState> {
  const user = await requireUser();
  const data = parseSeller(formData);

  if (!data.name) {
    return { error: "Seller name is required." };
  }

  // Org-scope guard: only touch sellers that belong to this organization.
  const existing = await prisma.seller.findFirst({
    where: { id, organizationId: user.organizationId },
  });

  if (!existing) {
    return { error: "Seller not found." };
  }

  await prisma.seller.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      city: orNull(data.city),
      state: orNull(data.state),
      motivation: orNull(data.motivation),
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      sellerId: existing.id,
      actorId: user.id,
      eventType: "seller.updated",
      eventLabel: `Seller updated: ${data.name}`,
    },
  });

  revalidatePath("/sellers");
  revalidatePath(`/sellers/${existing.id}`);
  redirect(`/sellers/${existing.id}`);
}

export async function deleteSeller(id: string) {
  const user = await requireUser();

  const existing = await prisma.seller.findFirst({
    where: { id, organizationId: user.organizationId },
  });

  if (!existing) {
    redirect("/sellers");
  }

  await prisma.seller.delete({ where: { id: existing.id } });

  // The activity log's sellerId is set to null on delete; keep a record of the event.
  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "seller.deleted",
      eventLabel: `Seller deleted: ${existing.name}`,
    },
  });

  revalidatePath("/sellers");
  revalidatePath("/dashboard");
  redirect("/sellers");
}
