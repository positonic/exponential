/*
  Warnings:

  - A unique constraint covering the columns `[emailHash]` on the table `CrmContact` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspaceId` to the `CrmContactInteraction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."CrmContact" ADD COLUMN     "connectionScore" INTEGER DEFAULT 0,
ADD COLUMN     "emailHash" TEXT,
ADD COLUMN     "googleContactId" TEXT,
ADD COLUMN     "importSource" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."CrmContactInteraction" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."ContactImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "processedContacts" INTEGER NOT NULL DEFAULT 0,
    "newContacts" INTEGER NOT NULL DEFAULT 0,
    "updatedContacts" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "googleSyncToken" TEXT,
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ContactImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactImportBatch_workspaceId_idx" ON "public"."ContactImportBatch"("workspaceId");

-- CreateIndex
CREATE INDEX "ContactImportBatch_createdById_idx" ON "public"."ContactImportBatch"("createdById");

-- CreateIndex
CREATE INDEX "ContactImportBatch_status_idx" ON "public"."ContactImportBatch"("status");

-- CreateIndex
CREATE INDEX "ContactImportBatch_createdAt_idx" ON "public"."ContactImportBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContact_emailHash_key" ON "public"."CrmContact"("emailHash");

-- CreateIndex
CREATE INDEX "CrmContact_emailHash_idx" ON "public"."CrmContact"("emailHash");

-- CreateIndex
CREATE INDEX "CrmContact_connectionScore_idx" ON "public"."CrmContact"("connectionScore");

-- CreateIndex
CREATE INDEX "CrmContact_workspaceId_importSource_idx" ON "public"."CrmContact"("workspaceId", "importSource");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_workspaceId_idx" ON "public"."CrmContactInteraction"("workspaceId");

-- CreateIndex
CREATE INDEX "CrmContactInteraction_occurredAt_idx" ON "public"."CrmContactInteraction"("occurredAt");

-- AddForeignKey
ALTER TABLE "public"."CrmContactInteraction" ADD CONSTRAINT "CrmContactInteraction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactImportBatch" ADD CONSTRAINT "ContactImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactImportBatch" ADD CONSTRAINT "ContactImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
