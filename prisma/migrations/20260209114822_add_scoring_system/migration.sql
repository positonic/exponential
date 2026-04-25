-- AlterTable
ALTER TABLE "public"."DailyPlan" ADD COLUMN     "estimationAccuracy" DOUBLE PRECISION,
ADD COLUMN     "overdueTasks" INTEGER,
ADD COLUMN     "processedOverdue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoreCalculated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoreId" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "leaderboardAnonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaderboardWorkspaceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "public"."DailyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "date" DATE NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "planCreated" INTEGER NOT NULL,
    "planCompleted" INTEGER NOT NULL,
    "taskCompletion" INTEGER NOT NULL,
    "habitCompletion" INTEGER NOT NULL,
    "schedulingBonus" INTEGER NOT NULL,
    "inboxBonus" INTEGER NOT NULL,
    "estimationBonus" INTEGER NOT NULL,
    "weeklyReviewBonus" INTEGER NOT NULL,
    "totalPlannedTasks" INTEGER NOT NULL,
    "completedTasks" INTEGER NOT NULL,
    "scheduledHabits" INTEGER NOT NULL,
    "completedHabits" INTEGER NOT NULL,
    "estimationAccuracy" DOUBLE PRECISION,
    "processedOverdue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductivityStreak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "streakType" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductivityStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "period" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "percentile" DOUBLE PRECISION,
    "totalDays" INTEGER,
    "consistency" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyScore_userId_idx" ON "public"."DailyScore"("userId");

-- CreateIndex
CREATE INDEX "DailyScore_workspaceId_idx" ON "public"."DailyScore"("workspaceId");

-- CreateIndex
CREATE INDEX "DailyScore_date_idx" ON "public"."DailyScore"("date");

-- CreateIndex
CREATE INDEX "DailyScore_totalScore_idx" ON "public"."DailyScore"("totalScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScore_userId_workspaceId_date_key" ON "public"."DailyScore"("userId", "workspaceId", "date");

-- CreateIndex
CREATE INDEX "ProductivityStreak_userId_idx" ON "public"."ProductivityStreak"("userId");

-- CreateIndex
CREATE INDEX "ProductivityStreak_streakType_idx" ON "public"."ProductivityStreak"("streakType");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityStreak_userId_workspaceId_streakType_key" ON "public"."ProductivityStreak"("userId", "workspaceId", "streakType");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_period_score_idx" ON "public"."LeaderboardEntry"("period", "score");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_userId_idx" ON "public"."LeaderboardEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_userId_workspaceId_period_key" ON "public"."LeaderboardEntry"("userId", "workspaceId", "period");

-- AddForeignKey
ALTER TABLE "public"."DailyPlan" ADD CONSTRAINT "DailyPlan_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "public"."DailyScore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyScore" ADD CONSTRAINT "DailyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyScore" ADD CONSTRAINT "DailyScore_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductivityStreak" ADD CONSTRAINT "ProductivityStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductivityStreak" ADD CONSTRAINT "ProductivityStreak_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
