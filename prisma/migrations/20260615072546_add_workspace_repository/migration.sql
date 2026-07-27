-- CreateTable
CREATE TABLE "WorkspaceRepository" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "installationId" TEXT,
    "addedById" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceRepository_workspaceId_idx" ON "WorkspaceRepository"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceRepository_integrationId_idx" ON "WorkspaceRepository"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRepository_workspaceId_fullName_key" ON "WorkspaceRepository"("workspaceId", "fullName");

-- AddForeignKey
ALTER TABLE "WorkspaceRepository" ADD CONSTRAINT "WorkspaceRepository_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRepository" ADD CONSTRAINT "WorkspaceRepository_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRepository" ADD CONSTRAINT "WorkspaceRepository_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
