-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "selectedTools" TEXT[],
ADD COLUMN     "usageType" TEXT,
ADD COLUMN     "userRole" TEXT;
