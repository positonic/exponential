-- CreateTable
CREATE TABLE "WorkspaceWeeklyNarrative" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceWeeklyNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceWeeklyNarrative_workspaceId_generatedAt_idx" ON "WorkspaceWeeklyNarrative"("workspaceId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceWeeklyNarrative_workspaceId_isoYear_isoWeek_key" ON "WorkspaceWeeklyNarrative"("workspaceId", "isoYear", "isoWeek");

-- AddForeignKey
ALTER TABLE "WorkspaceWeeklyNarrative" ADD CONSTRAINT "WorkspaceWeeklyNarrative_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
