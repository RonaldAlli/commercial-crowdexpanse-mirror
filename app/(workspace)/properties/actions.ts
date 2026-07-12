"use server";

import { AssetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/property-options";

export type PropertyFormState = { error?: string } | undefined;

const VALID_ASSET_TYPES = new Set<string>(Object.values(AssetType));

function orNull(value: string) {
  return value.length ? value : null;
}

function parseProperty(formData: FormData) {
  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const intOrNull = (key: string) => {
    const raw = str(key).replace(/[,$%\s]/g, "");
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };
  const floatOrNull = (key: string) => {
    const raw = str(key).replace(/[,$%\s]/g, "");
    if (!raw) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };

  return {
    name: str("name"),
    assetType: str("assetType"),
    status: str("status"),
    addressLine1: str("addressLine1"),
    city: str("city"),
    state: str("state"),
    postalCode: str("postalCode"),
    county: str("county"),
    sellerId: str("sellerId"),
    unitCount: intOrNull("unitCount"),
    squareFeet: intOrNull("squareFeet"),
    acreage: floatOrNull("acreage"),
    yearBuilt: intOrNull("yearBuilt"),
    occupancyRate: floatOrNull("occupancyRate"),
    noiAnnualUsd: intOrNull("noiAnnualUsd"),
    askingPriceUsd: intOrNull("askingPriceUsd"),
    estimatedValueUsd: intOrNull("estimatedValueUsd"),
    capRate: floatOrNull("capRate"),
  };
}

/**
 * Validate + normalize the form, resolving the seller within the caller's org.
 * Returns either a field payload ready for Prisma, or an error string.
 */
async function buildPayload(formData: FormData, organizationId: string) {
  const data = parseProperty(formData);

  if (!data.name) return { error: "Property name is required." } as const;
  if (!VALID_ASSET_TYPES.has(data.assetType)) return { error: "Select a valid asset type." } as const;
  if (!data.addressLine1 || !data.city || !data.state) {
    return { error: "Address, city, and state are required." } as const;
  }

  // Org-scope guard: a seller can only be attached if it belongs to this org.
  let sellerId: string | null = null;
  if (data.sellerId) {
    const seller = await prisma.seller.findFirst({
      where: { id: data.sellerId, organizationId },
      select: { id: true },
    });
    if (!seller) return { error: "Selected seller was not found in your organization." } as const;
    sellerId = seller.id;
  }

  return {
    payload: {
      name: data.name,
      assetType: data.assetType as AssetType,
      status: orNull(data.status),
      addressLine1: data.addressLine1,
      city: data.city,
      state: data.state,
      postalCode: orNull(data.postalCode),
      county: orNull(data.county),
      sellerId,
      unitCount: data.unitCount,
      squareFeet: data.squareFeet,
      acreage: data.acreage,
      yearBuilt: data.yearBuilt,
      occupancyRate: data.occupancyRate,
      noiAnnualUsd: data.noiAnnualUsd,
      askingPriceUsd: data.askingPriceUsd,
      estimatedValueUsd: data.estimatedValueUsd,
      capRate: data.capRate,
    },
  } as const;
}

export async function createProperty(
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const user = await requireUser();
  const result = await buildPayload(formData, user.organizationId);
  if ("error" in result) return { error: result.error };

  const property = await prisma.property.create({
    data: { organizationId: user.organizationId, ...result.payload },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId: property.id,
      sellerId: property.sellerId,
      actorId: user.id,
      eventType: "property.created",
      eventLabel: `Property added: ${property.name}`,
      eventBody: `${titleCase(property.assetType)} · ${property.city}, ${property.state}`,
    },
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  redirect(`/properties/${property.id}`);
}

export async function updateProperty(
  id: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const user = await requireUser();

  const existing = await prisma.property.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!existing) return { error: "Property not found." };

  const result = await buildPayload(formData, user.organizationId);
  if ("error" in result) return { error: result.error };

  const property = await prisma.property.update({
    where: { id: existing.id },
    data: result.payload,
  });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      propertyId: property.id,
      sellerId: property.sellerId,
      actorId: user.id,
      eventType: "property.updated",
      eventLabel: `Property updated: ${property.name}`,
    },
  });

  revalidatePath("/properties");
  revalidatePath(`/properties/${property.id}`);
  redirect(`/properties/${property.id}`);
}

export async function deleteProperty(id: string) {
  const user = await requireUser();
  await authorize(user, "DELETE", "PROPERTY", { targetId: id, propertyId: id });

  const existing = await prisma.property.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    redirect("/properties");
  }

  await prisma.property.delete({ where: { id: existing.id } });

  await prisma.activityLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      eventType: "property.deleted",
      eventLabel: `Property deleted: ${existing.name}`,
    },
  });

  revalidatePath("/properties");
  revalidatePath("/dashboard");
  redirect("/properties");
}
