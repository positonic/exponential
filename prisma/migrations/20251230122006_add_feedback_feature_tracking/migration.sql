-- AlterTable
ALTER TABLE "public"."Feedback" ADD COLUMN     "aiInteractionId" TEXT;

-- CreateTable
CREATE TABLE "public"."FeatureRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "feedbackCount" INTEGER NOT NULL DEFAULT 1,
    "avgRating" DOUBLE PRECISION,
    "feedbackIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_status_idx" ON "public"."FeatureRequest"("status");

-- CreateIndex
CREATE INDEX "FeatureRequest_priority_idx" ON "public"."FeatureRequest"("priority");

-- CreateIndex
CREATE INDEX "FeatureRequest_createdAt_idx" ON "public"."FeatureRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_aiInteractionId_idx" ON "public"."Feedback"("aiInteractionId");

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "public"."AiInteractionHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
