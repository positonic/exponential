-- Availability blocks: time a member marks themselves unavailable by hand.
-- Additive: a new table, nothing existing changes.

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityBlock_userId_startsAt_endsAt_idx" ON "AvailabilityBlock"("userId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
