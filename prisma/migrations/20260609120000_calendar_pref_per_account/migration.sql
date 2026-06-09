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
  -- For users who already had multiple accounts of the same provider, prefer
  -- the one that is actually connected (has a token, latest expiry) so the
  -- legacy selection lands on the live account rather than an arbitrary id.
  ORDER BY (a."access_token" IS NOT NULL) DESC, a."expires_at" DESC NULLS LAST, a."id"
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
