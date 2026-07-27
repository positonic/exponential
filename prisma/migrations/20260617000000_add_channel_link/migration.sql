-- CreateTable
CREATE TABLE "ChannelLink" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelLink_workspaceId_idx" ON "ChannelLink"("workspaceId");

-- CreateIndex
CREATE INDEX "ChannelLink_projectId_idx" ON "ChannelLink"("projectId");

-- CreateIndex
CREATE INDEX "ChannelLink_createdById_idx" ON "ChannelLink"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelLink_provider_externalId_key" ON "ChannelLink"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
