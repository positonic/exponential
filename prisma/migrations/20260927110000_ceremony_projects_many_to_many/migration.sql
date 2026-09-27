-- Ceremony ↔ Project becomes many-to-many (ADR-0059 amendment): a ceremony
-- reviews any number of projects. The single `Ceremony.projectId` is
-- promoted to a `CeremonyProject` join table and every existing link is
-- carried across before the column is dropped.

-- CreateTable
CREATE TABLE "CeremonyProject" (
    "id" TEXT NOT NULL,
    "ceremonyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeremonyProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyProject_ceremonyId_projectId_key" ON "CeremonyProject"("ceremonyId", "projectId");
CREATE INDEX "CeremonyProject_projectId_idx" ON "CeremonyProject"("projectId");

-- AddForeignKey
ALTER TABLE "CeremonyProject" ADD CONSTRAINT "CeremonyProject_ceremonyId_fkey" FOREIGN KEY ("ceremonyId") REFERENCES "Ceremony"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeremonyProject" ADD CONSTRAINT "CeremonyProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one join row per ceremony that had a project. The old FK was
-- SET NULL, so no dangling ids exist, but the JOIN keeps it safe regardless.
INSERT INTO "CeremonyProject" ("id", "ceremonyId", "projectId", "createdAt")
SELECT
    'cerp_' || md5(c."id" || ':' || c."projectId"),
    c."id",
    c."projectId",
    c."updatedAt"
FROM "Ceremony" c
JOIN "Project" p ON p."id" = c."projectId"
WHERE c."projectId" IS NOT NULL
ON CONFLICT ("ceremonyId", "projectId") DO NOTHING;

-- DropForeignKey / DropIndex / DropColumn
ALTER TABLE "Ceremony" DROP CONSTRAINT "Ceremony_projectId_fkey";
DROP INDEX "Ceremony_projectId_idx";
ALTER TABLE "Ceremony" DROP COLUMN "projectId";
