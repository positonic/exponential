-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "enableBounties" BOOLEAN;

-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "enableBounties" BOOLEAN NOT NULL DEFAULT false;
