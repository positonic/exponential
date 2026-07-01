-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "enableAutoEnrichContacts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CrmContactEnrichment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CrmContactEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmContactEnrichment_contactId_idx" ON "CrmContactEnrichment"("contactId");

-- CreateIndex
CREATE INDEX "CrmContactEnrichment_workspaceId_idx" ON "CrmContactEnrichment"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmContactEnrichment_status_idx" ON "CrmContactEnrichment"("status");

-- CreateIndex
CREATE INDEX "CrmContactEnrichment_createdAt_idx" ON "CrmContactEnrichment"("createdAt");

-- AddForeignKey
ALTER TABLE "CrmContactEnrichment" ADD CONSTRAINT "CrmContactEnrichment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactEnrichment" ADD CONSTRAINT "CrmContactEnrichment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
