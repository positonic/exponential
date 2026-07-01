-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "aiSourcedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
