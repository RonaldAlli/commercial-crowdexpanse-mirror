"use server";

import { AssetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export type BuyerFormState = { error?: string } | undefined;

const VALID_ASSET_TYPES = new Set<string>(Object.values(AssetType));

function orNull(value: string) {
  return value.length ? value : null;
}

function intOrNull(raw: string) {
  const cleaned = raw.replace(/[,$%\s]/g, "");
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parseBuyer(formData: FormData) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();

  // Multi-value: targetAssetTypes arrives as repeated checkbox values.
  const targetAssetTypes = formData
    .getAll("targetAssetTypes")
    .map(String)
    .filter((v) => VALID_ASSET_TYPES.has(v)) as AssetType[];

  // Multi-value: targetStates arrives as a comma/space/newline separated string.
  const targetStates = Array.from(
    new Set(
      str("targetStates")
        .split(/[\s,]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  return {
    name: str("name"),
    company: str("company"),
    email: str("email"),
    phone: str("phone"),
    targetAssetTypes,
    targetStates,
    minimumPurchaseUsd: intOrNull(str("minimumPurchaseUsd")),
    maximumPurchaseUsd: intOrNull(str("maximumPurchaseUsd")),
  };
}

function validate(data: ReturnType<typeof parseBuyer>): string | null {
  if (!data.name) return "Buyer name is required.";
  if (
    data.minimumPurchaseUsd != null &&
    data.maximumPurchaseUsd != null &&
    data.minimumPurchaseUsd > data.maximumPurchaseUsd
  ) {
    return "Minimum purchase cannot exceed maximum purchase.";
  }
  return null;
}

export async function createBuyer(
  _prev: BuyerFormState,
  formData: FormData,
): Promise<BuyerFormState> {
  const user = await requireUser();
  const data = parseBuyer(formData);
  const error = validate(data);
  if (error) return { error };

  const buyer = await prisma.buyer.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      targetAssetTypes: data.targetAssetTypes,
      targetStates: data.targetStates,
      minimumPurchaseUsd: data.minimumPurchaseUsd,
      maximumPurchaseUsd: data.maximumPurchaseUsd,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      buyerId: buyer.id,
      actorId: user.id,
      eventType: "buyer.created",
      eventLabel: `Buyer added: ${buyer.name}`,
      eventBody: buyer.company ?? null,
    },
  });

  revalidatePath("/buyers");
  revalidatePath("/dashboard");
  redirect(`/buyers/${buyer.id}`);
}

export async function updateBuyer(
  id: string,
  _prev: BuyerFormState,
  formData: FormData,
): Promise<BuyerFormState> {
  const user = await requireUser();

  const existing = await prisma.buyer.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Buyer not found." };

  const data = parseBuyer(formData);
  const error = validate(data);
  if (error) return { error };

  const buyer = await prisma.buyer.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      company: orNull(data.company),
      email: orNull(data.email),
      phone: orNull(data.phone),
      targetAssetTypes: data.targetAssetTypes,
      targetStates: data.targetStates,
      minimumPurchaseUsd: data.minimumPurchaseUsd,
      maximumPurchaseUsd: data.maximumPurchaseUsd,
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      buyerId: buyer.id,
      actorId: user.id,
      eventType: "buyer.updated",
      eventLabel: `Buyer updated: ${buyer.name}`,
    },
  });

  revalidatePath("/buyers");
  revalidatePath(`/buyers/${buyer.id}`);
  redirect(`/buyers/${buyer.id}`);
}

export async function deleteBuyer(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "BUYER", { targetId: id, buyerId: id });

  const existing = await prisma.buyer.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/buyers");
  }

  await prisma.buyer.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "buyer.deleted",
      eventLabel: `Buyer deleted: ${existing.name}`,
    },
  });

  revalidatePath("/buyers");
  revalidatePath("/dashboard");
  redirect("/buyers");
}
