-- CreateTable
CREATE TABLE "ActionSync" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'synced',

    CONSTRAINT "ActionSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionSync_provider_externalId_idx" ON "ActionSync"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ActionSync_provider_idx" ON "ActionSync"("provider");

-- CreateIndex
CREATE INDEX "ActionSync_actionId_idx" ON "ActionSync"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionSync_actionId_provider_key" ON "ActionSync"("actionId", "provider");

-- AddForeignKey
ALTER TABLE "ActionSync" ADD CONSTRAINT "ActionSync_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
