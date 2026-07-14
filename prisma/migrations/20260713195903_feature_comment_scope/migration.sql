-- AlterTable
ALTER TABLE "FeatureComment" ADD COLUMN     "scopeId" TEXT;

-- CreateIndex
CREATE INDEX "FeatureComment_scopeId_idx" ON "FeatureComment"("scopeId");

-- AddForeignKey
ALTER TABLE "FeatureComment" ADD CONSTRAINT "FeatureComment_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FeatureScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
