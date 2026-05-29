-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "Project_productId_idx" ON "Project"("productId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
