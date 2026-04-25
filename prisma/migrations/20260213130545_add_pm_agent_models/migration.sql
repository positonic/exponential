-- CreateTable
CREATE TABLE "public"."GitHubActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventAction" TEXT,
    "externalId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "commitSha" TEXT,
    "commitMessage" TEXT,
    "commitAuthor" TEXT,
    "commitUrl" TEXT,
    "branchName" TEXT,
    "prNumber" INTEGER,
    "prTitle" TEXT,
    "prState" TEXT,
    "prUrl" TEXT,
    "prAuthor" TEXT,
    "prMergedAt" TIMESTAMP(3),
    "prReviewState" TEXT,
    "prReviewer" TEXT,
    "repoFullName" TEXT NOT NULL,
    "repoUrl" TEXT,
    "actionId" TEXT,
    "mappingMethod" TEXT,
    "mappingConfidence" DOUBLE PRECISION,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SprintSnapshot" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "backlogCount" INTEGER NOT NULL DEFAULT 0,
    "todoCount" INTEGER NOT NULL DEFAULT 0,
    "inProgressCount" INTEGER NOT NULL DEFAULT 0,
    "inReviewCount" INTEGER NOT NULL DEFAULT 0,
    "doneCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "totalEffort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedEffort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "addedEffort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "commitsCount" INTEGER NOT NULL DEFAULT 0,
    "prsOpened" INTEGER NOT NULL DEFAULT 0,
    "prsMerged" INTEGER NOT NULL DEFAULT 0,
    "prsReviewed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SprintMetrics" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "plannedEffort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedEffort" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "velocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plannedActions" INTEGER NOT NULL DEFAULT 0,
    "completedActions" INTEGER NOT NULL DEFAULT 0,
    "addedActions" INTEGER NOT NULL DEFAULT 0,
    "removedActions" INTEGER NOT NULL DEFAULT 0,
    "avgCycleTime" DOUBLE PRECISION,
    "avgLeadTime" DOUBLE PRECISION,
    "avgReviewTime" DOUBLE PRECISION,
    "totalCommits" INTEGER NOT NULL DEFAULT 0,
    "totalPRs" INTEGER NOT NULL DEFAULT 0,
    "avgPrTurnaround" DOUBLE PRECISION,
    "completionRate" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActionStatusChange" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fromStatus" "public"."ActionStatus",
    "toStatus" "public"."ActionStatus" NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PMAgentConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "standupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "standupTime" TEXT NOT NULL DEFAULT '08:30',
    "wrapupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "wrapupTime" TEXT NOT NULL DEFAULT '18:00',
    "sprintReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sprintReviewDay" INTEGER NOT NULL DEFAULT 5,
    "sprintReviewTime" TEXT NOT NULL DEFAULT '15:00',
    "riskCheckEnabled" BOOLEAN NOT NULL DEFAULT true,
    "riskCheckInterval" INTEGER NOT NULL DEFAULT 4,
    "preferredChannel" TEXT NOT NULL DEFAULT 'whatsapp',
    "verbosity" TEXT NOT NULL DEFAULT 'normal',
    "includeGitHub" BOOLEAN NOT NULL DEFAULT true,
    "includeKanban" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "standupDefinitionId" TEXT,
    "wrapupDefinitionId" TEXT,
    "sprintReviewDefinitionId" TEXT,
    "riskCheckDefinitionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PMAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubActivity_workspaceId_idx" ON "public"."GitHubActivity"("workspaceId");

-- CreateIndex
CREATE INDEX "GitHubActivity_integrationId_idx" ON "public"."GitHubActivity"("integrationId");

-- CreateIndex
CREATE INDEX "GitHubActivity_actionId_idx" ON "public"."GitHubActivity"("actionId");

-- CreateIndex
CREATE INDEX "GitHubActivity_eventTimestamp_idx" ON "public"."GitHubActivity"("eventTimestamp");

-- CreateIndex
CREATE INDEX "GitHubActivity_repoFullName_idx" ON "public"."GitHubActivity"("repoFullName");

-- CreateIndex
CREATE INDEX "GitHubActivity_branchName_idx" ON "public"."GitHubActivity"("branchName");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubActivity_externalId_eventType_key" ON "public"."GitHubActivity"("externalId", "eventType");

-- CreateIndex
CREATE INDEX "SprintSnapshot_listId_idx" ON "public"."SprintSnapshot"("listId");

-- CreateIndex
CREATE INDEX "SprintSnapshot_snapshotDate_idx" ON "public"."SprintSnapshot"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "SprintSnapshot_listId_snapshotDate_key" ON "public"."SprintSnapshot"("listId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "SprintMetrics_listId_key" ON "public"."SprintMetrics"("listId");

-- CreateIndex
CREATE INDEX "SprintMetrics_listId_idx" ON "public"."SprintMetrics"("listId");

-- CreateIndex
CREATE INDEX "ActionStatusChange_actionId_idx" ON "public"."ActionStatusChange"("actionId");

-- CreateIndex
CREATE INDEX "ActionStatusChange_changedAt_idx" ON "public"."ActionStatusChange"("changedAt");

-- CreateIndex
CREATE INDEX "ActionStatusChange_toStatus_idx" ON "public"."ActionStatusChange"("toStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PMAgentConfig_userId_key" ON "public"."PMAgentConfig"("userId");

-- CreateIndex
CREATE INDEX "PMAgentConfig_userId_idx" ON "public"."PMAgentConfig"("userId");

-- CreateIndex
CREATE INDEX "PMAgentConfig_workspaceId_idx" ON "public"."PMAgentConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."GitHubActivity" ADD CONSTRAINT "GitHubActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GitHubActivity" ADD CONSTRAINT "GitHubActivity_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GitHubActivity" ADD CONSTRAINT "GitHubActivity_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SprintSnapshot" ADD CONSTRAINT "SprintSnapshot_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SprintMetrics" ADD CONSTRAINT "SprintMetrics_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."List"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionStatusChange" ADD CONSTRAINT "ActionStatusChange_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PMAgentConfig" ADD CONSTRAINT "PMAgentConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PMAgentConfig" ADD CONSTRAINT "PMAgentConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
