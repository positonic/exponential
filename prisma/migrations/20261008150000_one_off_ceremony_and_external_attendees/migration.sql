-- One-off ceremonies (ADR-0059 amendment, 2026-10-07): an ad hoc meeting
-- scheduled from a project is a Ceremony with no cadence and one occurrence.
ALTER TABLE "Ceremony" ALTER COLUMN "cadenceRule" DROP NOT NULL;
ALTER TABLE "Ceremony" ADD COLUMN "isOneOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Ceremony_workspaceId_isOneOff_idx" ON "Ceremony"("workspaceId", "isOneOff");

-- Attendees may be external people known by email (CONTEXT.md → Attendee),
-- mirroring TranscriptionSessionParticipant: userId becomes optional, email is
-- the per-meeting identity.
ALTER TABLE "MeetingAttendee" DROP CONSTRAINT "MeetingAttendee_userId_fkey";
DROP INDEX "MeetingAttendee_meetingId_userId_key";

ALTER TABLE "MeetingAttendee" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "MeetingAttendee" ADD COLUMN "contactId" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "name" TEXT;

-- Backfill every existing (member) row from its user before the NOT NULL and
-- the new unique land. A user with no email on file gets the `user:<id>`
-- sentinel the app writes for the same case, so the row stays unique per
-- meeting and is never emailed.
UPDATE "MeetingAttendee" AS ma
SET "email" = COALESCE(LOWER(TRIM(u."email")), 'user:' || u."id"),
    "name" = u."name"
FROM "User" AS u
WHERE u."id" = ma."userId";

ALTER TABLE "MeetingAttendee" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_email_key" ON "MeetingAttendee"("meetingId", "email");

-- CreateIndex
CREATE INDEX "MeetingAttendee_contactId_idx" ON "MeetingAttendee"("contactId");

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
