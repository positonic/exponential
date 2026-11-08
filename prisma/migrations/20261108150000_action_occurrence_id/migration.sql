-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "occurrenceId" TEXT;

-- CreateIndex
CREATE INDEX "Action_occurrenceId_idx" ON "Action"("occurrenceId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CeremonyOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
