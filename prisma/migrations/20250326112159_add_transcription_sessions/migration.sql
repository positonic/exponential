-- CreateTable
CREATE TABLE "TranscriptionSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "transcription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "TranscriptionSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptionSession_sessionId_key" ON "TranscriptionSession"("sessionId");

-- CreateIndex
CREATE INDEX "TranscriptionSession_sessionId_idx" ON "TranscriptionSession"("sessionId");

-- CreateIndex
CREATE INDEX "TranscriptionSession_userId_idx" ON "TranscriptionSession"("userId");

-- CreateIndex
CREATE INDEX "Outcome_projectId_idx" ON "Outcome"("projectId");

-- AddForeignKey
ALTER TABLE "TranscriptionSession" ADD CONSTRAINT "TranscriptionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
