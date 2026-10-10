-- DropIndex
DROP INDEX "CalendarEvent_userId_sourceType_externalId_startsAt_key";

-- AlterTable
ALTER TABLE "CalendarFeed" ADD COLUMN     "lastSyncAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarFeedId_externalId_startsAt_key" ON "CalendarEvent"("calendarFeedId", "externalId", "startsAt");

