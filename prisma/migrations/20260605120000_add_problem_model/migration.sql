-- Pipeline Triage: Problem (Stage 1–2). See docs/adr/0008-pipeline-triage-model.md.
-- A validated issue worth solving, scoped to a Product. `impact`/`confidence`
-- are the two prioritisation axes; ease is deliberately omitted (lives on the
-- Approach later). `parkedAt`/`parkReason` ship now to avoid a second migration.

-- CreateEnum
CREATE TYPE "ProblemStage" AS ENUM ('IDEA', 'QUALIFIED', 'PRIORITISED');

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence" TEXT,
    "category" TEXT,
    "impact" INTEGER,
    "confidence" INTEGER,
    "stage" "ProblemStage" NOT NULL DEFAULT 'IDEA',
    "parkedAt" TIMESTAMP(3),
    "parkReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Problem_productId_idx" ON "Problem"("productId");

-- CreateIndex
CREATE INDEX "Problem_stage_idx" ON "Problem"("stage");

-- CreateIndex
CREATE INDEX "Problem_createdById_idx" ON "Problem"("createdById");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
