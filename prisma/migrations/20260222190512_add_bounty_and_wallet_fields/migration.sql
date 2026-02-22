-- CreateEnum
CREATE TYPE "public"."BountyStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ClaimStatus" AS ENUM ('ACTIVE', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "bountyAmount" DECIMAL(65,30),
ADD COLUMN     "bountyDeadline" TIMESTAMP(3),
ADD COLUMN     "bountyDifficulty" TEXT,
ADD COLUMN     "bountyExternalUrl" TEXT,
ADD COLUMN     "bountyMaxClaimants" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "bountySkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bountyStatus" "public"."BountyStatus",
ADD COLUMN     "bountyToken" TEXT,
ADD COLUMN     "isBounty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "contributorSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "isContributor" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."BountyClaim" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "status" "public"."ClaimStatus" NOT NULL DEFAULT 'ACTIVE',
    "submissionUrl" TEXT,
    "submissionNotes" TEXT,
    "reviewNotes" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BountyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BountyClaim_actionId_idx" ON "public"."BountyClaim"("actionId");

-- CreateIndex
CREATE INDEX "BountyClaim_claimantId_idx" ON "public"."BountyClaim"("claimantId");

-- CreateIndex
CREATE INDEX "BountyClaim_status_idx" ON "public"."BountyClaim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BountyClaim_actionId_claimantId_key" ON "public"."BountyClaim"("actionId", "claimantId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "public"."Wallet"("address");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "public"."Wallet"("userId");

-- CreateIndex
CREATE INDEX "Action_isBounty_idx" ON "public"."Action"("isBounty");

-- CreateIndex
CREATE INDEX "Action_bountyStatus_idx" ON "public"."Action"("bountyStatus");

-- AddForeignKey
ALTER TABLE "public"."BountyClaim" ADD CONSTRAINT "BountyClaim_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BountyClaim" ADD CONSTRAINT "BountyClaim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
