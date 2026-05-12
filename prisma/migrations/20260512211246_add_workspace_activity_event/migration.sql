-- CreateTable
CREATE TABLE "WorkspaceActivityEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceActivityEvent_workspaceId_createdAt_idx" ON "WorkspaceActivityEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceActivityEvent_workspaceId_userId_createdAt_idx" ON "WorkspaceActivityEvent"("workspaceId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceActivityEvent" ADD CONSTRAINT "WorkspaceActivityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceActivityEvent" ADD CONSTRAINT "WorkspaceActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
