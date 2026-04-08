/*
  Warnings:

  - Added the required column `updatedAt` to the `Goal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Goal" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "health" TEXT,
ADD COLUMN     "healthUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "parentGoalId" INTEGER,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill updatedAt for existing rows
UPDATE "public"."Goal" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

-- Now set NOT NULL constraint
ALTER TABLE "public"."Goal" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."GoalProgressSnapshot" (
    "id" TEXT NOT NULL,
    "goalId" INTEGER NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "health" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalProgressSnapshot_goalId_idx" ON "public"."GoalProgressSnapshot"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalProgressSnapshot_goalId_snapshotDate_key" ON "public"."GoalProgressSnapshot"("goalId", "snapshotDate");

-- CreateIndex
CREATE INDEX "Goal_parentGoalId_idx" ON "public"."Goal"("parentGoalId");

-- CreateIndex
CREATE INDEX "Goal_status_idx" ON "public"."Goal"("status");

-- AddForeignKey
ALTER TABLE "public"."Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "public"."Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoalProgressSnapshot" ADD CONSTRAINT "GoalProgressSnapshot_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
