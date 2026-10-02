-- CreateTable
CREATE TABLE "WorkspaceUpdateConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "weekday" INTEGER NOT NULL DEFAULT 5,
    "hour" INTEGER NOT NULL DEFAULT 9,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "reviewerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assistantId" TEXT,
    "indexPageId" TEXT,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceUpdateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUpdate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "pageId" TEXT,
    "items" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "feedback" TEXT,
    "model" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "skippedById" TEXT,
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUpdateConfig_workspaceId_key" ON "WorkspaceUpdateConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUpdate_pageId_key" ON "WorkspaceUpdate"("pageId");

-- CreateIndex
CREATE INDEX "WorkspaceUpdate_workspaceId_kind_windowEnd_idx" ON "WorkspaceUpdate"("workspaceId", "kind", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUpdate_workspaceId_kind_periodKey_key" ON "WorkspaceUpdate"("workspaceId", "kind", "periodKey");

-- AddForeignKey
ALTER TABLE "WorkspaceUpdateConfig" ADD CONSTRAINT "WorkspaceUpdateConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUpdate" ADD CONSTRAINT "WorkspaceUpdate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUpdate" ADD CONSTRAINT "WorkspaceUpdate_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

