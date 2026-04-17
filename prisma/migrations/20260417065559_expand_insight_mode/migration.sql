/*
  Warnings:

  - The values [WISH] on the enum `InsightType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `createdById` to the `Insight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `Insight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Insight` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."InsightType_new" AS ENUM ('PAIN_POINT', 'OPPORTUNITY', 'FEEDBACK', 'PERSONA', 'JOURNEY', 'OBSERVATION', 'COMPETITIVE');
ALTER TABLE "public"."Insight" ALTER COLUMN "type" TYPE "public"."InsightType_new" USING ("type"::text::"public"."InsightType_new");
ALTER TYPE "public"."InsightType" RENAME TO "InsightType_old";
ALTER TYPE "public"."InsightType_new" RENAME TO "InsightType";
DROP TYPE "public"."InsightType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Insight" DROP CONSTRAINT "Insight_researchId_fkey";

-- AlterTable
ALTER TABLE "public"."Insight" ADD COLUMN     "body" TEXT,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "sentiment" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "researchId" DROP NOT NULL,
ALTER COLUMN "description" SET DEFAULT '';

-- CreateTable
CREATE TABLE "public"."InsightTag" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightTag_tagId_idx" ON "public"."InsightTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightTag_insightId_tagId_key" ON "public"."InsightTag"("insightId", "tagId");

-- CreateIndex
CREATE INDEX "Insight_productId_idx" ON "public"."Insight"("productId");

-- CreateIndex
CREATE INDEX "Insight_type_idx" ON "public"."Insight"("type");

-- CreateIndex
CREATE INDEX "Insight_createdById_idx" ON "public"."Insight"("createdById");

-- AddForeignKey
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "public"."Research"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Insight" ADD CONSTRAINT "Insight_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InsightTag" ADD CONSTRAINT "InsightTag_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "public"."Insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InsightTag" ADD CONSTRAINT "InsightTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
