-- CreateEnum
CREATE TYPE "ChecklistItemCategory" AS ENUM ('DUE_DILIGENCE', 'ESCROW', 'FINANCING', 'ASSIGNMENT', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'COMPLETE', 'WAIVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "CompletionEvidenceType" AS ENUM ('NONE', 'DOCUMENT', 'TASK', 'MANUAL');

-- CreateTable
CREATE TABLE "closing_checklist_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_checklist_template_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "category" "ChecklistItemCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completionEvidenceType" "CompletionEvidenceType" NOT NULL DEFAULT 'MANUAL',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closing_checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_checklists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "sourceTemplateId" TEXT,
    "templateVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_checklist_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "category" "ChecklistItemCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "completionEvidenceType" "CompletionEvidenceType" NOT NULL DEFAULT 'MANUAL',
    "position" INTEGER NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waiverReason" TEXT,
    "evidenceDocumentId" TEXT,
    "evidenceTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "closing_checklist_templates_organizationId_idx" ON "closing_checklist_templates"("organizationId");

-- CreateIndex
CREATE INDEX "closing_checklist_template_items_organizationId_idx" ON "closing_checklist_template_items"("organizationId");

-- CreateIndex
CREATE INDEX "closing_checklist_template_items_templateId_idx" ON "closing_checklist_template_items"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "closing_checklists_opportunityId_key" ON "closing_checklists"("opportunityId");

-- CreateIndex
CREATE INDEX "closing_checklists_organizationId_idx" ON "closing_checklists"("organizationId");

-- CreateIndex
CREATE INDEX "closing_checklist_items_organizationId_idx" ON "closing_checklist_items"("organizationId");

-- CreateIndex
CREATE INDEX "closing_checklist_items_checklistId_idx" ON "closing_checklist_items"("checklistId");

-- AddForeignKey
ALTER TABLE "closing_checklist_templates" ADD CONSTRAINT "closing_checklist_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_checklist_template_items" ADD CONSTRAINT "closing_checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "closing_checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_checklists" ADD CONSTRAINT "closing_checklists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_checklists" ADD CONSTRAINT "closing_checklists_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_checklists" ADD CONSTRAINT "closing_checklists_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "closing_checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_checklist_items" ADD CONSTRAINT "closing_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "closing_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

