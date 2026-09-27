-- Ceremony.includeProjects: append a "linked projects" section (the ACTIVE
-- projects in the ceremony's scope, with DRI and next action) to every
-- generated agenda unless the template already places one. On by default.

-- AlterTable
ALTER TABLE "Ceremony" ADD COLUMN "includeProjects" BOOLEAN NOT NULL DEFAULT true;
