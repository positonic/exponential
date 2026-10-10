-- CreateEnum
CREATE TYPE "AdrStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'DEPRECATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AdrLinkType" AS ENUM ('SUPERSEDES', 'MENTIONS');

-- AlterTable
ALTER TABLE "WorkspaceRepository" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "AdrSyncConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "adrPaths" TEXT[] DEFAULT ARRAY['docs/adr']::TEXT[],
    "integrationId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTreeSha" TEXT,
    "lastCommitSha" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdrSyncConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdrDocument" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "number" INTEGER,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "status" "AdrStatus" NOT NULL DEFAULT 'UNKNOWN',
    "statusRaw" TEXT,
    "decidedAt" TIMESTAMP(3),
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "lastSeenSha" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdrDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdrLink" (
    "id" TEXT NOT NULL,
    "type" "AdrLinkType" NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdrLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdrTicketLink" (
    "id" TEXT NOT NULL,
    "adrId" TEXT NOT NULL,
    "ticketId" TEXT,
    "featureId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdrTicketLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdrSyncRun" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB,
    "triggeredById" TEXT,

    CONSTRAINT "AdrSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdrSyncConfig_repositoryId_idx" ON "AdrSyncConfig"("repositoryId");

-- CreateIndex
CREATE INDEX "AdrSyncConfig_integrationId_idx" ON "AdrSyncConfig"("integrationId");

-- CreateIndex
CREATE INDEX "AdrSyncConfig_createdById_idx" ON "AdrSyncConfig"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "AdrSyncConfig_workspaceId_repositoryId_key" ON "AdrSyncConfig"("workspaceId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AdrSyncConfig_workspaceId_shortCode_key" ON "AdrSyncConfig"("workspaceId", "shortCode");

-- CreateIndex
CREATE INDEX "AdrDocument_repositoryId_deletedAt_idx" ON "AdrDocument"("repositoryId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdrDocument_repositoryId_path_key" ON "AdrDocument"("repositoryId", "path");

-- CreateIndex
CREATE INDEX "AdrLink_toId_idx" ON "AdrLink"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "AdrLink_fromId_toId_type_key" ON "AdrLink"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "AdrTicketLink_ticketId_idx" ON "AdrTicketLink"("ticketId");

-- CreateIndex
CREATE INDEX "AdrTicketLink_featureId_idx" ON "AdrTicketLink"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "AdrTicketLink_adrId_ticketId_key" ON "AdrTicketLink"("adrId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "AdrTicketLink_adrId_featureId_key" ON "AdrTicketLink"("adrId", "featureId");

-- CreateIndex
CREATE INDEX "AdrSyncRun_configId_startedAt_idx" ON "AdrSyncRun"("configId", "startedAt");

-- CreateIndex
CREATE INDEX "AdrSyncRun_triggeredById_idx" ON "AdrSyncRun"("triggeredById");

-- CreateIndex
CREATE INDEX "WorkspaceRepository_productId_idx" ON "WorkspaceRepository"("productId");

-- AddForeignKey
ALTER TABLE "WorkspaceRepository" ADD CONSTRAINT "WorkspaceRepository_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncConfig" ADD CONSTRAINT "AdrSyncConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncConfig" ADD CONSTRAINT "AdrSyncConfig_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "WorkspaceRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncConfig" ADD CONSTRAINT "AdrSyncConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncConfig" ADD CONSTRAINT "AdrSyncConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrDocument" ADD CONSTRAINT "AdrDocument_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "WorkspaceRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrLink" ADD CONSTRAINT "AdrLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "AdrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrLink" ADD CONSTRAINT "AdrLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "AdrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrTicketLink" ADD CONSTRAINT "AdrTicketLink_adrId_fkey" FOREIGN KEY ("adrId") REFERENCES "AdrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrTicketLink" ADD CONSTRAINT "AdrTicketLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrTicketLink" ADD CONSTRAINT "AdrTicketLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrTicketLink" ADD CONSTRAINT "AdrTicketLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncRun" ADD CONSTRAINT "AdrSyncRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AdrSyncConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdrSyncRun" ADD CONSTRAINT "AdrSyncRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

