-- CreateTable
CREATE TABLE "FeatureComment" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "threadId" TEXT,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "quotedText" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureComment_featureId_idx" ON "FeatureComment"("featureId");

-- CreateIndex
CREATE INDEX "FeatureComment_threadId_idx" ON "FeatureComment"("threadId");

-- CreateIndex
CREATE INDEX "FeatureComment_parentId_idx" ON "FeatureComment"("parentId");

-- CreateIndex
CREATE INDEX "FeatureComment_createdById_idx" ON "FeatureComment"("createdById");

-- AddForeignKey
ALTER TABLE "FeatureComment" ADD CONSTRAINT "FeatureComment_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureComment" ADD CONSTRAINT "FeatureComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FeatureComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureComment" ADD CONSTRAINT "FeatureComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
