-- A ceremony can pick the icon it shows on meeting cards; null uses the kind's default.

-- AlterTable
ALTER TABLE "Ceremony" ADD COLUMN     "icon" TEXT;
