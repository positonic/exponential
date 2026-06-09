-- Make CalendarPreference per-OAuth-account instead of per-(user, provider).
-- This unblocks connecting multiple Google accounts, each with its own
-- selected calendars.

-- DropIndex (old per-(user, provider) uniqueness)
DROP INDEX "CalendarPreference_userId_provider_key";

-- AlterTable
ALTER TABLE "CalendarPreference" ADD COLUMN     "accountId" TEXT;

-- Backfill: link each existing preference to the user's single OAuth account
-- for that provider. CalendarPreference.provider uses "google"/"microsoft";
-- the Account table stores Microsoft as "microsoft-entra-id".
UPDATE "CalendarPreference" cp
SET "accountId" = (
  SELECT a."id"
  FROM "Account" a
  WHERE a."userId" = cp."userId"
    AND a."provider" = CASE
      WHEN cp."provider" = 'microsoft' THEN 'microsoft-entra-id'
      ELSE cp."provider"
    END
  ORDER BY a."id"
  LIMIT 1
)
WHERE cp."accountId" IS NULL;

-- CreateIndex
CREATE INDEX "CalendarPreference_accountId_idx" ON "CalendarPreference"("accountId");

-- CreateIndex (NULLs are allowed/non-colliding in Postgres unique indexes,
-- so any preference that couldn't be backfilled stays valid)
CREATE UNIQUE INDEX "CalendarPreference_accountId_key" ON "CalendarPreference"("accountId");

-- AddForeignKey
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
