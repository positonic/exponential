-- CreateTable
CREATE TABLE "public"."WeeklyReviewCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "weekStartDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectsReviewed" INTEGER NOT NULL DEFAULT 0,
    "statusChanges" INTEGER NOT NULL DEFAULT 0,
    "priorityChanges" INTEGER NOT NULL DEFAULT 0,
    "actionsAdded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeeklyReviewCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyReviewCompletion_userId_idx" ON "public"."WeeklyReviewCompletion"("userId");

-- CreateIndex
CREATE INDEX "WeeklyReviewCompletion_workspaceId_idx" ON "public"."WeeklyReviewCompletion"("workspaceId");

-- CreateIndex
CREATE INDEX "WeeklyReviewCompletion_weekStartDate_idx" ON "public"."WeeklyReviewCompletion"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReviewCompletion_userId_workspaceId_weekStartDate_key" ON "public"."WeeklyReviewCompletion"("userId", "workspaceId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "public"."WeeklyReviewCompletion" ADD CONSTRAINT "WeeklyReviewCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyReviewCompletion" ADD CONSTRAINT "WeeklyReviewCompletion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
