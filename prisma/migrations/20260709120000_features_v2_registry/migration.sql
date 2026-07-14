-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'CONSTRAINT');

-- AlterEnum
ALTER TYPE "FeatureStatus" ADD VALUE 'DEPRECATED';

-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "areaId" TEXT;

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "scopeId" TEXT,
    "statement" TEXT NOT NULL,
    "kind" "RequirementKind",
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturePage" (
    "featureId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturePage_pkey" PRIMARY KEY ("featureId","pageId")
);

-- CreateIndex
CREATE INDEX "Area_productId_idx" ON "Area"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Area_productId_name_key" ON "Area"("productId", "name");

-- CreateIndex
CREATE INDEX "Requirement_featureId_idx" ON "Requirement"("featureId");

-- CreateIndex
CREATE INDEX "Requirement_scopeId_idx" ON "Requirement"("scopeId");

-- CreateIndex
CREATE INDEX "FeaturePage_pageId_idx" ON "FeaturePage"("pageId");

-- CreateIndex
CREATE INDEX "FeaturePage_scopeId_idx" ON "FeaturePage"("scopeId");

-- CreateIndex
CREATE INDEX "Feature_areaId_idx" ON "Feature"("areaId");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturePage" ADD CONSTRAINT "FeaturePage_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturePage" ADD CONSTRAINT "FeaturePage_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "KnowledgePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturePage" ADD CONSTRAINT "FeaturePage_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "FeatureScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

