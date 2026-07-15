-- Ticket sync provenance (ADR-0042): soft disconnect + run-ledger columns.
-- Disconnect becomes a state ("integrationId IS NULL"), never a row delete;
-- deleting an Integration SetNulls the link instead of cascading the config,
-- its TicketSync links, and its TicketSyncRun history away.

-- DropForeignKey
ALTER TABLE "TicketSyncConfig" DROP CONSTRAINT "TicketSyncConfig_integrationId_fkey";

-- AlterTable
ALTER TABLE "TicketSyncConfig" ALTER COLUMN "integrationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TicketSyncRun" ADD COLUMN "triggeredById" TEXT,
ADD COLUMN "revertedAt" TIMESTAMP(3),
ADD COLUMN "revertedByRunId" TEXT;

-- CreateIndex
CREATE INDEX "TicketSyncRun_triggeredById_idx" ON "TicketSyncRun"("triggeredById");

-- AddForeignKey
ALTER TABLE "TicketSyncConfig" ADD CONSTRAINT "TicketSyncConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSyncRun" ADD CONSTRAINT "TicketSyncRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSyncRun" ADD CONSTRAINT "TicketSyncRun_revertedByRunId_fkey" FOREIGN KEY ("revertedByRunId") REFERENCES "TicketSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
