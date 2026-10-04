-- AlterTable
ALTER TABLE "WorkspaceUpdateConfig" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newsletterCollectionId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceUpdate" ADD COLUMN     "deliveries" JSONB,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkspaceUpdate_status_approvedAt_idx" ON "WorkspaceUpdate"("status", "approvedAt");

