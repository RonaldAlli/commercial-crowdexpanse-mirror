-- Owner contact storage: separate operational contact records from canonical owner identity.
CREATE TABLE "owner_contacts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "label" TEXT,
  "contactName" TEXT,
  "company" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "mailingAddress" TEXT,
  "notes" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "owner_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "owner_contacts_organizationId_idx" ON "owner_contacts"("organizationId");
CREATE INDEX "owner_contacts_ownerId_idx" ON "owner_contacts"("ownerId");

ALTER TABLE "owner_contacts"
ADD CONSTRAINT "owner_contacts_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_contacts"
ADD CONSTRAINT "owner_contacts_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "owners"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
