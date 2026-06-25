-- CreateTable
CREATE TABLE "CrmContactAttachment" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmContactAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmContactAttachment_contactId_idx" ON "CrmContactAttachment"("contactId");

-- CreateIndex
CREATE INDEX "CrmContactAttachment_workspaceId_idx" ON "CrmContactAttachment"("workspaceId");

-- AddForeignKey
ALTER TABLE "CrmContactAttachment" ADD CONSTRAINT "CrmContactAttachment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
