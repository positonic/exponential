-- AlterTable
ALTER TABLE "public"."AiInteractionHistory" ADD COLUMN     "anthropicRequestId" TEXT;

-- CreateIndex
CREATE INDEX "AiInteractionHistory_anthropicRequestId_idx" ON "public"."AiInteractionHistory"("anthropicRequestId");
