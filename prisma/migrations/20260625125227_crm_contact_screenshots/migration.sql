/*
  Warnings:

  - You are about to drop the `CrmContactAttachment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CrmContactAttachment" DROP CONSTRAINT "CrmContactAttachment_contactId_fkey";

-- DropTable
DROP TABLE "CrmContactAttachment";

-- CreateTable
CREATE TABLE "CrmContactScreenshot" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "screenshotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmContactScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmContactScreenshot_contactId_idx" ON "CrmContactScreenshot"("contactId");

-- CreateIndex
CREATE INDEX "CrmContactScreenshot_screenshotId_idx" ON "CrmContactScreenshot"("screenshotId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContactScreenshot_contactId_screenshotId_key" ON "CrmContactScreenshot"("contactId", "screenshotId");

-- AddForeignKey
ALTER TABLE "CrmContactScreenshot" ADD CONSTRAINT "CrmContactScreenshot_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContactScreenshot" ADD CONSTRAINT "CrmContactScreenshot_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "Screenshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
