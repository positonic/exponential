-- CreateTable
CREATE TABLE "CeremonyOccurrenceUpdate" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "draftAnswers" JSONB NOT NULL DEFAULT '{}',
    "draftedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "flaggedBlocker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeremonyOccurrenceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CeremonyOccurrenceUpdate_occurrenceId_idx" ON "CeremonyOccurrenceUpdate"("occurrenceId");

-- CreateIndex
CREATE INDEX "CeremonyOccurrenceUpdate_userId_idx" ON "CeremonyOccurrenceUpdate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyOccurrenceUpdate_occurrenceId_userId_key" ON "CeremonyOccurrenceUpdate"("occurrenceId", "userId");

-- AddForeignKey
ALTER TABLE "CeremonyOccurrenceUpdate" ADD CONSTRAINT "CeremonyOccurrenceUpdate_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CeremonyOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyOccurrenceUpdate" ADD CONSTRAINT "CeremonyOccurrenceUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
