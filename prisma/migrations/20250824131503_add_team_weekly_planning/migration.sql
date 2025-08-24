-- AlterTable
ALTER TABLE "public"."_GoalOutcomes" ADD CONSTRAINT "_GoalOutcomes_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "public"."_GoalOutcomes_AB_unique";

-- AlterTable
ALTER TABLE "public"."_GoalProjects" ADD CONSTRAINT "_GoalProjects_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "public"."_GoalProjects_AB_unique";

-- AlterTable
ALTER TABLE "public"."_ProjectOutcomes" ADD CONSTRAINT "_ProjectOutcomes_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "public"."_ProjectOutcomes_AB_unique";

-- CreateTable
CREATE TABLE "public"."WeeklyOutcome" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "teamId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "WeeklyOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WeeklyOutcomeAssignee" (
    "id" TEXT NOT NULL,
    "weeklyOutcomeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyOutcomeAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMemberWeeklyCapacity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "projectId" TEXT,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "availableHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMemberWeeklyCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_WeeklyOutcomeActions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WeeklyOutcomeActions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "WeeklyOutcome_teamId_idx" ON "public"."WeeklyOutcome"("teamId");

-- CreateIndex
CREATE INDEX "WeeklyOutcome_projectId_idx" ON "public"."WeeklyOutcome"("projectId");

-- CreateIndex
CREATE INDEX "WeeklyOutcome_weekStartDate_idx" ON "public"."WeeklyOutcome"("weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyOutcome_status_idx" ON "public"."WeeklyOutcome"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyOutcome_teamId_projectId_weekStartDate_title_key" ON "public"."WeeklyOutcome"("teamId", "projectId", "weekStartDate", "title");

-- CreateIndex
CREATE INDEX "WeeklyOutcomeAssignee_weeklyOutcomeId_idx" ON "public"."WeeklyOutcomeAssignee"("weeklyOutcomeId");

-- CreateIndex
CREATE INDEX "WeeklyOutcomeAssignee_userId_idx" ON "public"."WeeklyOutcomeAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyOutcomeAssignee_weeklyOutcomeId_userId_key" ON "public"."WeeklyOutcomeAssignee"("weeklyOutcomeId", "userId");

-- CreateIndex
CREATE INDEX "TeamMemberWeeklyCapacity_userId_idx" ON "public"."TeamMemberWeeklyCapacity"("userId");

-- CreateIndex
CREATE INDEX "TeamMemberWeeklyCapacity_teamId_idx" ON "public"."TeamMemberWeeklyCapacity"("teamId");

-- CreateIndex
CREATE INDEX "TeamMemberWeeklyCapacity_weekStartDate_idx" ON "public"."TeamMemberWeeklyCapacity"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMemberWeeklyCapacity_userId_teamId_weekStartDate_projec_key" ON "public"."TeamMemberWeeklyCapacity"("userId", "teamId", "weekStartDate", "projectId");

-- CreateIndex
CREATE INDEX "_WeeklyOutcomeActions_B_index" ON "public"."_WeeklyOutcomeActions"("B");

-- AddForeignKey
ALTER TABLE "public"."WeeklyOutcome" ADD CONSTRAINT "WeeklyOutcome_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyOutcome" ADD CONSTRAINT "WeeklyOutcome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyOutcome" ADD CONSTRAINT "WeeklyOutcome_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyOutcomeAssignee" ADD CONSTRAINT "WeeklyOutcomeAssignee_weeklyOutcomeId_fkey" FOREIGN KEY ("weeklyOutcomeId") REFERENCES "public"."WeeklyOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyOutcomeAssignee" ADD CONSTRAINT "WeeklyOutcomeAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMemberWeeklyCapacity" ADD CONSTRAINT "TeamMemberWeeklyCapacity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMemberWeeklyCapacity" ADD CONSTRAINT "TeamMemberWeeklyCapacity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMemberWeeklyCapacity" ADD CONSTRAINT "TeamMemberWeeklyCapacity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_WeeklyOutcomeActions" ADD CONSTRAINT "_WeeklyOutcomeActions_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_WeeklyOutcomeActions" ADD CONSTRAINT "_WeeklyOutcomeActions_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."WeeklyOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
