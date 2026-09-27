-- AlterTable
ALTER TABLE "CeremonyOccurrence" ADD COLUMN     "notesPageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyOccurrence_notesPageId_key" ON "CeremonyOccurrence"("notesPageId");

-- AddForeignKey
ALTER TABLE "CeremonyOccurrence" ADD CONSTRAINT "CeremonyOccurrence_notesPageId_fkey" FOREIGN KEY ("notesPageId") REFERENCES "KnowledgePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
