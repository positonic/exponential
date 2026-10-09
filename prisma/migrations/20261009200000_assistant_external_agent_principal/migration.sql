-- ADR-0067: an Assistant is backed by its own External agent principal.

-- CreateEnum
CREATE TYPE "AgentExecutor" AS ENUM ('MASTRA', 'LOCAL_CLI');

-- AlterTable
ALTER TABLE "ExternalAgent" ADD COLUMN     "executor" "AgentExecutor" NOT NULL DEFAULT 'MASTRA';

-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "externalAgentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Assistant_externalAgentId_key" ON "Assistant"("externalAgentId");

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_externalAgentId_fkey" FOREIGN KEY ("externalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
