-- AlterTable
ALTER TABLE "acquisition_sessions" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "acquisition_sessions" ADD COLUMN "pausedMs" INTEGER NOT NULL DEFAULT 0;
