-- CreateTable
CREATE TABLE "MeetingFeatureDraft" (
    "id" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "productId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vision" TEXT,
    "tickets" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingFeatureDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingFeatureDraft_transcriptionSessionId_idx" ON "MeetingFeatureDraft"("transcriptionSessionId");

-- CreateIndex
CREATE INDEX "MeetingFeatureDraft_productId_idx" ON "MeetingFeatureDraft"("productId");

-- CreateIndex
CREATE INDEX "MeetingFeatureDraft_createdById_idx" ON "MeetingFeatureDraft"("createdById");

-- AddForeignKey
ALTER TABLE "MeetingFeatureDraft" ADD CONSTRAINT "MeetingFeatureDraft_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingFeatureDraft" ADD CONSTRAINT "MeetingFeatureDraft_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingFeatureDraft" ADD CONSTRAINT "MeetingFeatureDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
