-- Decouple connected calendars from the NextAuth `Account` identity table.
-- Connected calendars now live in `ConnectedAccount`, owned by the linking
-- User and keyed by (userId, provider, providerAccountId) so the same external
-- account can be connected by multiple users independently. See ADR-0009.
--
-- No token data is migrated: every legacy calendar grant lacked calendar.readonly
-- and had dead/expired tokens, so a reconnect is required regardless. Existing
-- CalendarPreference rows reference Account ids that no longer apply, so we clear
-- them; selections rebuild (default = primary) on first reconnect.

-- Clear preferences BEFORE adding the NOT NULL connectedAccountId column
-- (there is no valid ConnectedAccount to point them at yet).
DELETE FROM "CalendarPreference";

-- Drop the old Account linkage on CalendarPreference
ALTER TABLE "CalendarPreference" DROP CONSTRAINT "CalendarPreference_accountId_fkey";
DROP INDEX "CalendarPreference_accountId_idx";
DROP INDEX "CalendarPreference_accountId_key";

ALTER TABLE "CalendarPreference" DROP COLUMN "accountId",
ADD COLUMN     "connectedAccountId" TEXT NOT NULL;

-- New ConnectedAccount table
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerEmail" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");
CREATE UNIQUE INDEX "ConnectedAccount_userId_provider_providerAccountId_key" ON "ConnectedAccount"("userId", "provider", "providerAccountId");
CREATE INDEX "CalendarPreference_connectedAccountId_idx" ON "CalendarPreference"("connectedAccountId");
CREATE UNIQUE INDEX "CalendarPreference_connectedAccountId_key" ON "CalendarPreference"("connectedAccountId");

-- Foreign keys
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarPreference" ADD CONSTRAINT "CalendarPreference_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
