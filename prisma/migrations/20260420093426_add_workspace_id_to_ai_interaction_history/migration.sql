-- AlterTable
ALTER TABLE "public"."AiInteractionHistory" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "AiInteractionHistory_workspaceId_conversationId_idx" ON "public"."AiInteractionHistory"("workspaceId", "conversationId");

-- CreateIndex
CREATE INDEX "AiInteractionHistory_workspaceId_systemUserId_createdAt_idx" ON "public"."AiInteractionHistory"("workspaceId", "systemUserId", "createdAt");
