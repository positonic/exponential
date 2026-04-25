-- CreateEnum
CREATE TYPE "public"."EpicStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."EffortUnit" AS ENUM ('STORY_POINTS', 'T_SHIRT', 'HOURS');

-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "effortEstimate" DOUBLE PRECISION,
ADD COLUMN     "epicId" TEXT;

-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "effortUnit" "public"."EffortUnit" NOT NULL DEFAULT 'STORY_POINTS';

-- CreateTable
CREATE TABLE "public"."Epic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."EpicStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Epic_workspaceId_idx" ON "public"."Epic"("workspaceId");

-- CreateIndex
CREATE INDEX "Epic_ownerId_idx" ON "public"."Epic"("ownerId");

-- CreateIndex
CREATE INDEX "Epic_status_idx" ON "public"."Epic"("status");

-- CreateIndex
CREATE INDEX "Action_epicId_idx" ON "public"."Action"("epicId");

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "public"."Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Epic" ADD CONSTRAINT "Epic_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Epic" ADD CONSTRAINT "Epic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
