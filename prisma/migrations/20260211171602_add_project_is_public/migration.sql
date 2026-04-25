-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Project_isPublic_idx" ON "public"."Project"("isPublic");
