import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

const adminEmail = (process.env.ADMIN_EMAIL ?? process.env.DEMO_EMAIL ?? "operator@commercial.crowdexpanse.com")
  .trim()
  .toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.DEMO_PASSWORD;
const adminName = process.env.ADMIN_NAME ?? "Commercial Admin";

async function main() {
  if (!adminPassword) {
    throw new Error("Set ADMIN_PASSWORD (or DEMO_PASSWORD) before seeding the admin user.");
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "commercial-crowdexpanse" },
    update: {},
    create: {
      name: "CrowdExpanse Commercial",
      slug: "commercial-crowdexpanse",
    },
  });

  const hashedPassword = hashPassword(adminPassword);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      organizationId: organization.id,
      hashedPassword,
      role: UserRole.ADMIN,
    },
    create: {
      organizationId: organization.id,
      name: adminName,
      email: adminEmail,
      hashedPassword,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Seeded admin user: ${user.email} (org: ${organization.name})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
