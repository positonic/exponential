-- AlterTable
ALTER TABLE "public"."Action" ADD COLUMN     "blockedByIds" TEXT[],
ADD COLUMN     "blockingIds" TEXT[],
ADD COLUMN     "chunkDurationMins" INTEGER,
ADD COLUMN     "chunkNumber" INTEGER,
ADD COLUMN     "etaDaysOffset" INTEGER,
ADD COLUMN     "etaStatus" TEXT,
ADD COLUMN     "idealStartTime" TEXT,
ADD COLUMN     "instanceDate" TIMESTAMP(3),
ADD COLUMN     "isAutoScheduled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isHardDeadline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isReminderOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentChunkId" TEXT,
ADD COLUMN     "recurringParentId" TEXT,
ADD COLUMN     "scheduleId" TEXT,
ADD COLUMN     "timeSpentMins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalChunks" INTEGER;

-- CreateTable
CREATE TABLE "public"."TaskSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecurringTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "duration" INTEGER NOT NULL DEFAULT 30,
    "repeatPattern" TEXT NOT NULL,
    "repeatDays" INTEGER[],
    "repeatInterval" INTEGER NOT NULL DEFAULT 1,
    "scheduleId" TEXT,
    "idealStartTime" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "projectId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSchedule_workspaceId_idx" ON "public"."TaskSchedule"("workspaceId");

-- CreateIndex
CREATE INDEX "TaskSchedule_createdById_idx" ON "public"."TaskSchedule"("createdById");

-- CreateIndex
CREATE INDEX "TaskSchedule_isDefault_idx" ON "public"."TaskSchedule"("isDefault");

-- CreateIndex
CREATE INDEX "RecurringTask_workspaceId_idx" ON "public"."RecurringTask"("workspaceId");

-- CreateIndex
CREATE INDEX "RecurringTask_projectId_idx" ON "public"."RecurringTask"("projectId");

-- CreateIndex
CREATE INDEX "RecurringTask_createdById_idx" ON "public"."RecurringTask"("createdById");

-- CreateIndex
CREATE INDEX "RecurringTask_scheduleId_idx" ON "public"."RecurringTask"("scheduleId");

-- CreateIndex
CREATE INDEX "Action_scheduleId_idx" ON "public"."Action"("scheduleId");

-- CreateIndex
CREATE INDEX "Action_recurringParentId_idx" ON "public"."Action"("recurringParentId");

-- CreateIndex
CREATE INDEX "Action_parentChunkId_idx" ON "public"."Action"("parentChunkId");

-- CreateIndex
CREATE INDEX "Action_isAutoScheduled_idx" ON "public"."Action"("isAutoScheduled");

-- CreateIndex
CREATE INDEX "Action_etaStatus_idx" ON "public"."Action"("etaStatus");

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."TaskSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_recurringParentId_fkey" FOREIGN KEY ("recurringParentId") REFERENCES "public"."RecurringTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_parentChunkId_fkey" FOREIGN KEY ("parentChunkId") REFERENCES "public"."Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskSchedule" ADD CONSTRAINT "TaskSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskSchedule" ADD CONSTRAINT "TaskSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTask" ADD CONSTRAINT "RecurringTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTask" ADD CONSTRAINT "RecurringTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTask" ADD CONSTRAINT "RecurringTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTask" ADD CONSTRAINT "RecurringTask_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."TaskSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
