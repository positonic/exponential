-- Proposed time (ADR-0061). Additive with defaults: every existing row becomes
-- CONFIRMED with no author agent, source reference or note.

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('PROPOSED', 'CONFIRMED');

-- AlterTable
ALTER TABLE "TimeEntry"
  ADD COLUMN "status" "TimeEntryStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "createdByAgentId" TEXT,
  ADD COLUMN "sourceRef" TEXT,
  ADD COLUMN "note" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_userId_sourceRef_key" ON "TimeEntry"("userId", "sourceRef");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_status_startedAt_idx" ON "TimeEntry"("userId", "status", "startedAt");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "ExternalAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
