-- TimeEntry integrity guards. The service layer already validates these but
-- the DB is the only place that survives a misbehaving client / direct SQL
-- write. Prisma schema can't express either of these constructs, so they
-- live as a raw migration.

-- 1. Reject persisted rows where endedAt <= startedAt. NULL endedAt (running
--    entry) is allowed through because NULL ≤ X evaluates UNKNOWN, which
--    a CHECK constraint treats as passing.
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_endedAt_after_startedAt"
  CHECK ("endedAt" IS NULL OR "endedAt" > "startedAt");

-- 2. One running timer per user, globally. Partial unique index on userId
--    scoped to rows whose endedAt is null. Completed entries are unaffected.
CREATE UNIQUE INDEX "TimeEntry_userId_running_unique"
  ON "TimeEntry" ("userId")
  WHERE "endedAt" IS NULL;
