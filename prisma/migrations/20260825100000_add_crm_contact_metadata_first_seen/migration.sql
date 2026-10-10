-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB;
