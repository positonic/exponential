-- "Implemented by" for a Decision gains actions alongside tickets and features.

-- AlterTable
ALTER TABLE "DecisionLink" ADD COLUMN     "actionId" TEXT;

-- CreateIndex
CREATE INDEX "DecisionLink_actionId_idx" ON "DecisionLink"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionLink_decisionId_actionId_key" ON "DecisionLink"("decisionId", "actionId");

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
