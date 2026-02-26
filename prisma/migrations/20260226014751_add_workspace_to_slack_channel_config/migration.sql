/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId]` on the table `SlackChannelConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."SlackChannelConfig" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannelConfig_workspaceId_key" ON "public"."SlackChannelConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "SlackChannelConfig_workspaceId_idx" ON "public"."SlackChannelConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."SlackChannelConfig" ADD CONSTRAINT "SlackChannelConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
