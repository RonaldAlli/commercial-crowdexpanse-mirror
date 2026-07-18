CREATE TYPE "ContactOutreachStatus" AS ENUM (
  'NEW',
  'ATTEMPTING',
  'CONTACTED',
  'RESPONDED',
  'QUALIFIED',
  'DEAD',
  'DO_NOT_CONTACT'
);

CREATE TYPE "ContactMethod" AS ENUM (
  'CALL',
  'TEXT',
  'EMAIL',
  'MAIL'
);

CREATE TYPE "ContactTouchType" AS ENUM (
  'CALL',
  'TEXT',
  'EMAIL',
  'MAIL',
  'NOTE'
);

ALTER TABLE "owner_contacts"
  ADD COLUMN "outreachStatus" "ContactOutreachStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "preferredContactMethod" "ContactMethod",
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotText" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badEmail" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sellers"
  ADD COLUMN "outreachStatus" "ContactOutreachStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "preferredContactMethod" "ContactMethod",
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotText" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badEmail" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "buyers"
  ADD COLUMN "outreachStatus" "ContactOutreachStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "preferredContactMethod" "ContactMethod",
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "assignedUserId" TEXT,
  ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doNotText" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badPhone" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "badEmail" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "contact_touches" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerContactId" TEXT,
  "sellerId" TEXT,
  "buyerId" TEXT,
  "type" "ContactTouchType" NOT NULL,
  "summary" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_touches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_touches_exactly_one_parent" CHECK (num_nonnulls("ownerContactId", "sellerId", "buyerId") = 1)
);

CREATE INDEX "owner_contacts_assignedUserId_idx" ON "owner_contacts"("assignedUserId");
CREATE INDEX "sellers_assignedUserId_idx" ON "sellers"("assignedUserId");
CREATE INDEX "buyers_assignedUserId_idx" ON "buyers"("assignedUserId");
CREATE INDEX "contact_touches_organizationId_idx" ON "contact_touches"("organizationId");
CREATE INDEX "contact_touches_ownerContactId_idx" ON "contact_touches"("ownerContactId");
CREATE INDEX "contact_touches_sellerId_idx" ON "contact_touches"("sellerId");
CREATE INDEX "contact_touches_buyerId_idx" ON "contact_touches"("buyerId");
CREATE INDEX "contact_touches_createdById_idx" ON "contact_touches"("createdById");

ALTER TABLE "owner_contacts"
  ADD CONSTRAINT "owner_contacts_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sellers"
  ADD CONSTRAINT "sellers_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "buyers"
  ADD CONSTRAINT "buyers_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_touches"
  ADD CONSTRAINT "contact_touches_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_touches"
  ADD CONSTRAINT "contact_touches_ownerContactId_fkey"
  FOREIGN KEY ("ownerContactId") REFERENCES "owner_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_touches"
  ADD CONSTRAINT "contact_touches_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_touches"
  ADD CONSTRAINT "contact_touches_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_touches"
  ADD CONSTRAINT "contact_touches_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
