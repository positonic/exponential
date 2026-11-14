-- Cache for the Person week summary (Person page, V2): an AI summary of one
-- person's ISO week, written only from the activity events one viewer can see
-- on that person's page. One row per (viewer, subject, ISO week). `eventIds`
-- holds the events the text was written from, so a read can refuse a row that
-- names something the viewer can no longer see. New table, no backfill.

-- CreateTable
CREATE TABLE "PersonWeekSummary" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "eventIds" JSONB NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonWeekSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonWeekSummary_subjectId_idx" ON "PersonWeekSummary"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonWeekSummary_viewerId_subjectId_isoYear_isoWeek_key" ON "PersonWeekSummary"("viewerId", "subjectId", "isoYear", "isoWeek");

-- AddForeignKey
ALTER TABLE "PersonWeekSummary" ADD CONSTRAINT "PersonWeekSummary_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonWeekSummary" ADD CONSTRAINT "PersonWeekSummary_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

