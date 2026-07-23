-- CreateEnum
CREATE TYPE "AcquisitionChannel" AS ENUM ('OWNER_DIRECT', 'COMMERCIAL_BROKER', 'CREXI', 'LOOPNET', 'COSTAR', 'COUNTY_RECORDS', 'TAX_DELINQUENT', 'BANK_SPECIAL_SERVICER', 'RECEIVERSHIP', 'AUCTION', 'REFERRAL', 'OUTBOUND_CALLING', 'DIRECT_MAIL', 'EMAIL_OUTREACH', 'WEB_INBOUND', 'DEALFLOW_PROBATE', 'DEALFLOW_FSBO', 'DEALFLOW_EXPIRED', 'DEALFLOW_VACANT', 'DEALFLOW_PREFORECLOSURE', 'DEALFLOW_TAX_DELINQUENT', 'DEALFLOW_REFERRAL');

-- AlterTable (additive, nullable — backfill-safe)
ALTER TABLE "sellers" ADD COLUMN     "acquisitionChannel" "AcquisitionChannel",
ADD COLUMN     "acquisitionCampaign" TEXT,
ADD COLUMN     "acquisitionEventKey" TEXT;

-- AlterTable (additive, nullable — retained-from-lead, immutable per AC-ATTR-5)
ALTER TABLE "opportunities" ADD COLUMN     "acquisitionChannel" "AcquisitionChannel",
ADD COLUMN     "acquisitionCampaign" TEXT,
ADD COLUMN     "acquisitionEventKey" TEXT;
