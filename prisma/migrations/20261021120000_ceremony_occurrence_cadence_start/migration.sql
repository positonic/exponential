-- ADR-0059 amendment (2026-10-21): an occurrence may be moved off its cadence
-- tick or added by hand. `cadenceStart` records the tick a generated
-- occurrence stands for, so moving it (changing `scheduledStart`) does not
-- let the hourly expansion re-insert the vacated tick. Ad hoc and one-off
-- occurrences carry NULL, which the unique index allows any number of.

-- AlterTable
ALTER TABLE "CeremonyOccurrence" ADD COLUMN "cadenceStart" TIMESTAMP(3);

-- Backfill: every existing occurrence of a recurring ceremony sits on its tick.
UPDATE "CeremonyOccurrence" o
SET "cadenceStart" = o."scheduledStart"
FROM "Ceremony" c
WHERE c."id" = o."ceremonyId" AND c."isOneOff" = false AND c."cadenceRule" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyOccurrence_ceremonyId_cadenceStart_key" ON "CeremonyOccurrence"("ceremonyId", "cadenceStart");
