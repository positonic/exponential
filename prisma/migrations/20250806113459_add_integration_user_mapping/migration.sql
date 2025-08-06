-- CreateTable
CREATE TABLE "IntegrationUserMapping" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationUserMapping_integrationId_idx" ON "IntegrationUserMapping"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationUserMapping_userId_idx" ON "IntegrationUserMapping"("userId");

-- CreateIndex
CREATE INDEX "IntegrationUserMapping_externalUserId_idx" ON "IntegrationUserMapping"("externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationUserMapping_integrationId_externalUserId_key" ON "IntegrationUserMapping"("integrationId", "externalUserId");

-- AddForeignKey
ALTER TABLE "IntegrationUserMapping" ADD CONSTRAINT "IntegrationUserMapping_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationUserMapping" ADD CONSTRAINT "IntegrationUserMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
