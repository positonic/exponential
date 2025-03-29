-- CreateTable
CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
