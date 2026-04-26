-- CreateTable
CREATE TABLE "public"."PortfolioReviewCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspacesInFocus" INTEGER NOT NULL DEFAULT 0,
    "krCheckInsLogged" INTEGER NOT NULL DEFAULT 0,
    "goalsReprioritized" INTEGER NOT NULL DEFAULT 0,
    "projectsReprioritized" INTEGER NOT NULL DEFAULT 0,
    "focusStatementsSet" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,

    CONSTRAINT "PortfolioReviewCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceWeeklyFocus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "isInFocus" BOOLEAN NOT NULL DEFAULT false,
    "focusText" TEXT,
    "focusGoalIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "focusKeyResultIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceWeeklyFocus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioReviewCompletion_userId_idx" ON "public"."PortfolioReviewCompletion"("userId");

-- CreateIndex
CREATE INDEX "PortfolioReviewCompletion_weekStartDate_idx" ON "public"."PortfolioReviewCompletion"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioReviewCompletion_userId_weekStartDate_key" ON "public"."PortfolioReviewCompletion"("userId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WorkspaceWeeklyFocus_userId_weekStartDate_idx" ON "public"."WorkspaceWeeklyFocus"("userId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WorkspaceWeeklyFocus_workspaceId_idx" ON "public"."WorkspaceWeeklyFocus"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceWeeklyFocus_userId_workspaceId_weekStartDate_key" ON "public"."WorkspaceWeeklyFocus"("userId", "workspaceId", "weekStartDate");

-- AddForeignKey
ALTER TABLE "public"."PortfolioReviewCompletion" ADD CONSTRAINT "PortfolioReviewCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceWeeklyFocus" ADD CONSTRAINT "WorkspaceWeeklyFocus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceWeeklyFocus" ADD CONSTRAINT "WorkspaceWeeklyFocus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
