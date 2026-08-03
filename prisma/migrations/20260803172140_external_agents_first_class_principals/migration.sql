-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExternalAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "shadowUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalAgentKey" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalAgentKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAgent_shadowUserId_key" ON "ExternalAgent"("shadowUserId");

-- CreateIndex
CREATE INDEX "ExternalAgent_ownerId_idx" ON "ExternalAgent"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAgentKey_keyHash_key" ON "ExternalAgentKey"("keyHash");

-- CreateIndex
CREATE INDEX "ExternalAgentKey_agentId_idx" ON "ExternalAgentKey"("agentId");

-- AddForeignKey
ALTER TABLE "ExternalAgent" ADD CONSTRAINT "ExternalAgent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAgent" ADD CONSTRAINT "ExternalAgent_shadowUserId_fkey" FOREIGN KEY ("shadowUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAgentKey" ADD CONSTRAINT "ExternalAgentKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ExternalAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
