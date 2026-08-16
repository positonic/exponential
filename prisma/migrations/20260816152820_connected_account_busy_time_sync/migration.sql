-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN     "calendarLastSyncAttemptAt" TIMESTAMP(3),
ADD COLUMN     "calendarLastSyncError" TEXT,
ADD COLUMN     "calendarLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "calendarSyncStatus" TEXT NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "CalendarEvent_connectedAccountId_idx" ON "CalendarEvent"("connectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_connectedAccountId_providerCalendarId_externa_key" ON "CalendarEvent"("connectedAccountId", "providerCalendarId", "externalId", "startsAt");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

