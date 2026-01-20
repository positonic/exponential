-- CreateTable
CREATE TABLE "public"."CalendarPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedCalendarIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cachedCalendars" JSONB,
    "cacheUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarPreference_userId_key" ON "public"."CalendarPreference"("userId");

-- CreateIndex
CREATE INDEX "CalendarPreference_userId_idx" ON "public"."CalendarPreference"("userId");

-- AddForeignKey
ALTER TABLE "public"."CalendarPreference" ADD CONSTRAINT "CalendarPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
