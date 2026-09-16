-- A Meeting can be linked to the Features it discussed (many-to-many), set by
-- hand from the meeting page and the Add Meeting modal.

-- CreateTable
CREATE TABLE "MeetingFeature" (
    "id" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingFeature_featureId_idx" ON "MeetingFeature"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingFeature_transcriptionSessionId_featureId_key" ON "MeetingFeature"("transcriptionSessionId", "featureId");

-- AddForeignKey
ALTER TABLE "MeetingFeature" ADD CONSTRAINT "MeetingFeature_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingFeature" ADD CONSTRAINT "MeetingFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingFeature" ADD CONSTRAINT "MeetingFeature_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
