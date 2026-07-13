-- CreateTable
CREATE TABLE "TicketSyncConfig" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'notion',
    "integrationId" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "databaseName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "statusMap" JSONB,
    "propertyNames" JSONB,
    "lastPulledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSyncConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSync" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'notion',
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "snapshot" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tombstonedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSyncRun" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'pull',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "archived" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB,

    CONSTRAINT "TicketSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketSyncConfig_integrationId_idx" ON "TicketSyncConfig"("integrationId");

-- CreateIndex
CREATE INDEX "TicketSyncConfig_createdById_idx" ON "TicketSyncConfig"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSyncConfig_productId_provider_key" ON "TicketSyncConfig"("productId", "provider");

-- CreateIndex
CREATE INDEX "TicketSync_provider_externalId_idx" ON "TicketSync"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSync_ticketId_provider_key" ON "TicketSync"("ticketId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSync_configId_externalId_key" ON "TicketSync"("configId", "externalId");

-- CreateIndex
CREATE INDEX "TicketSyncRun_configId_startedAt_idx" ON "TicketSyncRun"("configId", "startedAt");

-- AddForeignKey
ALTER TABLE "TicketSyncConfig" ADD CONSTRAINT "TicketSyncConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSyncConfig" ADD CONSTRAINT "TicketSyncConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSyncConfig" ADD CONSTRAINT "TicketSyncConfig_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSync" ADD CONSTRAINT "TicketSync_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TicketSyncConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSync" ADD CONSTRAINT "TicketSync_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSyncRun" ADD CONSTRAINT "TicketSyncRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TicketSyncConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

