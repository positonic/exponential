-- CreateTable
CREATE TABLE "KeyResultFeature" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyResultFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeyResultFeature_keyResultId_idx" ON "KeyResultFeature"("keyResultId");

-- CreateIndex
CREATE INDEX "KeyResultFeature_featureId_idx" ON "KeyResultFeature"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyResultFeature_keyResultId_featureId_key" ON "KeyResultFeature"("keyResultId", "featureId");

-- AddForeignKey
ALTER TABLE "KeyResultFeature" ADD CONSTRAINT "KeyResultFeature_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResultFeature" ADD CONSTRAINT "KeyResultFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
