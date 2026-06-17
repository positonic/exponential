-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "progressOverride" DOUBLE PRECISION,
ADD COLUMN     "progressOverrideAt" TIMESTAMP(3),
ADD COLUMN     "progressOverrideById" TEXT;
