-- AlterTable: add snapshot label + icon for generic "page" favourites.
-- Entity favourites (objective/keyResult) leave these NULL and resolve titles live.
ALTER TABLE "Favorite" ADD COLUMN "label" TEXT;
ALTER TABLE "Favorite" ADD COLUMN "icon" TEXT;
