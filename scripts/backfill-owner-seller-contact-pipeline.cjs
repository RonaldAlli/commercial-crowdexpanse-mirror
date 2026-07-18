const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    organizationSlug: "commercial-crowdexpanse",
    actorEmail: "operator@commercial.crowdexpanse.com",
    dryRun: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--org" || arg === "--organization-slug") {
      options.organizationSlug = argv[index + 1] ?? options.organizationSlug;
      index += 1;
      continue;
    }
    if (arg === "--actor-email") {
      options.actorEmail = argv[index + 1] ?? options.actorEmail;
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      index += 1;
    }
  }

  return options;
}

function formatMailingAddress(property) {
  if (!property) return null;
  return [property.addressLine1, property.city, property.state, property.postalCode].filter(Boolean).join(", ") || null;
}

function companyForOwner(owner) {
  return owner.entityType === "INDIVIDUAL" ? null : owner.displayName;
}

function contactNameForOwner(owner) {
  return owner.entityType === "INDIVIDUAL" ? owner.displayName : null;
}

function buildOwnerContactSeed(owner, sampleProperty, runDate) {
  return {
    organizationId: owner.organizationId,
    ownerId: owner.id,
    label: "Backfilled primary contact",
    contactName: contactNameForOwner(owner),
    company: companyForOwner(owner),
    mailingAddress: formatMailingAddress(sampleProperty),
    notes: `Backfilled from imported owner lead on ${runDate}. Direct decision-maker phone/email still need to be researched.`,
    isPrimary: true,
  };
}

function buildSellerSeed(owner, sampleProperty, runDate) {
  return {
    organizationId: owner.organizationId,
    ownerId: owner.id,
    name: owner.displayName,
    company: companyForOwner(owner),
    city: sampleProperty?.city ?? null,
    state: sampleProperty?.state ?? null,
    motivation: `Backfilled from imported owner lead on ${runDate}. Seller qualification and direct contact details are still pending.`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDate = new Date().toISOString().slice(0, 10);

  const organization = await prisma.organization.findUnique({
    where: { slug: args.organizationSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!organization) {
    throw new Error(`Organization not found: ${args.organizationSlug}`);
  }

  const actor = await prisma.user.findUnique({
    where: { email: args.actorEmail },
    select: { id: true, organizationId: true },
  });
  if (!actor) {
    throw new Error(`Actor user not found: ${args.actorEmail}`);
  }
  if (actor.organizationId !== organization.id) {
    throw new Error(`Actor ${args.actorEmail} does not belong to ${organization.slug}`);
  }

  const owners = await prisma.owner.findMany({
    where: {
      organizationId: organization.id,
      status: "ACTIVE",
      properties: { some: {} },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      organizationId: true,
      displayName: true,
      entityType: true,
      contacts: { select: { id: true }, take: 1 },
      properties: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sellerId: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
        },
      },
    },
  });

  const selectedOwners = args.limit ? owners.slice(0, args.limit) : owners;
  const propertyIdToOwnerId = new Map();
  for (const owner of selectedOwners) {
    for (const property of owner.properties) {
      propertyIdToOwnerId.set(property.id, owner.id);
    }
  }

  const existingSellers = await prisma.seller.findMany({
    where: { organizationId: organization.id, ownerId: { not: null } },
    select: { id: true, ownerId: true },
    orderBy: { createdAt: "asc" },
  });
  const sellerByOwnerId = new Map();
  for (const seller of existingSellers) {
    if (seller.ownerId && !sellerByOwnerId.has(seller.ownerId)) {
      sellerByOwnerId.set(seller.ownerId, seller.id);
    }
  }

  const openOpportunities = await prisma.opportunity.findMany({
    where: {
      organizationId: organization.id,
      sellerId: null,
      propertyId: { in: Array.from(propertyIdToOwnerId.keys()) },
    },
    select: { propertyId: true },
  });
  const opportunityPropertyIdsByOwnerId = new Map();
  for (const opportunity of openOpportunities) {
    const ownerId = propertyIdToOwnerId.get(opportunity.propertyId);
    if (!ownerId) continue;
    const bucket = opportunityPropertyIdsByOwnerId.get(ownerId) ?? [];
    bucket.push(opportunity.propertyId);
    opportunityPropertyIdsByOwnerId.set(ownerId, bucket);
  }

  const summary = {
    organization: organization.slug,
    dryRun: args.dryRun,
    ownersScanned: selectedOwners.length,
    ownerContactsCreated: 0,
    sellersCreated: 0,
    propertiesLinkedToSeller: 0,
    opportunitiesLinkedToSeller: 0,
    ownersAlreadyHadPrimaryContact: 0,
    ownersAlreadyHadSeller: 0,
  };

  for (let index = 0; index < selectedOwners.length; index += 1) {
    const owner = selectedOwners[index];
    const sampleProperty = owner.properties[0] ?? null;
    const propertyIdsMissingSeller = owner.properties.filter((property) => !property.sellerId).map((property) => property.id);
    const opportunityPropertyIds = opportunityPropertyIdsByOwnerId.get(owner.id) ?? [];

    if (owner.contacts.length > 0) {
      summary.ownersAlreadyHadPrimaryContact += 1;
    }

    let sellerId = sellerByOwnerId.get(owner.id) ?? null;
    if (sellerId) {
      summary.ownersAlreadyHadSeller += 1;
    }

    if (args.dryRun) {
      if (!owner.contacts.length) summary.ownerContactsCreated += 1;
      if (!sellerId) summary.sellersCreated += 1;
      summary.propertiesLinkedToSeller += propertyIdsMissingSeller.length;
      summary.opportunitiesLinkedToSeller += opportunityPropertyIds.length;
    } else {
      await prisma.$transaction(async (tx) => {
        if (!owner.contacts.length) {
          await tx.ownerContact.create({
            data: buildOwnerContactSeed(owner, sampleProperty, runDate),
          });
          summary.ownerContactsCreated += 1;
        }

        if (!sellerId) {
          const createdSeller = await tx.seller.create({
            data: buildSellerSeed(owner, sampleProperty, runDate),
            select: { id: true },
          });
          sellerId = createdSeller.id;
          sellerByOwnerId.set(owner.id, sellerId);
          summary.sellersCreated += 1;
        }

        if (sellerId && propertyIdsMissingSeller.length > 0) {
          const propertyUpdate = await tx.property.updateMany({
            where: {
              organizationId: organization.id,
              id: { in: propertyIdsMissingSeller },
              sellerId: null,
            },
            data: { sellerId },
          });
          summary.propertiesLinkedToSeller += propertyUpdate.count;
        }

        if (sellerId && opportunityPropertyIds.length > 0) {
          const opportunityUpdate = await tx.opportunity.updateMany({
            where: {
              organizationId: organization.id,
              sellerId: null,
              propertyId: { in: opportunityPropertyIds },
            },
            data: { sellerId },
          });
          summary.opportunitiesLinkedToSeller += opportunityUpdate.count;
        }
      });
    }

    if ((index + 1) % 250 === 0) {
      console.log(`Processed ${index + 1}/${selectedOwners.length}`);
    }
  }

  if (!args.dryRun) {
    await prisma.activityLog.create({
      data: {
        organizationId: organization.id,
        actorId: actor.id,
        eventType: "contact.pipeline_backfilled",
        eventLabel: "Owner contacts and sellers backfilled from imported leads",
        eventBody: JSON.stringify(summary),
      },
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
