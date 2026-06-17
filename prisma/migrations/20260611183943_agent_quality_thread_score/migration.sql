-- AlterTable
ALTER TABLE "AiInteractionHistory" ADD COLUMN     "promptVersion" TEXT;

-- CreateTable
CREATE TABLE "ThreadScore" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "resolved" BOOLEAN NOT NULL,
    "grounded" BOOLEAN NOT NULL,
    "toolSuccess" BOOLEAN NOT NULL,
    "noDeflection" BOOLEAN NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "failureLane" TEXT,
    "judgeModel" TEXT NOT NULL,
    "judgeVersion" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL,
    "firstTurnAt" TIMESTAMP(3) NOT NULL,
    "lastTurnAt" TIMESTAMP(3) NOT NULL,
    "avgResponseTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL,
    "threadScoreId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "transcript" JSONB NOT NULL,
    "violatingTurnIndex" INTEGER NOT NULL,
    "expectation" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadScore_conversationId_key" ON "ThreadScore"("conversationId");

-- CreateIndex
CREATE INDEX "ThreadScore_failureLane_idx" ON "ThreadScore"("failureLane");

-- CreateIndex
CREATE INDEX "ThreadScore_createdAt_idx" ON "ThreadScore"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvalCase_threadScoreId_key" ON "EvalCase"("threadScoreId");

-- CreateIndex
CREATE INDEX "EvalCase_conversationId_idx" ON "EvalCase"("conversationId");

-- CreateIndex
CREATE INDEX "EvalCase_lane_idx" ON "EvalCase"("lane");

-- AddForeignKey
ALTER TABLE "EvalCase" ADD CONSTRAINT "EvalCase_threadScoreId_fkey" FOREIGN KEY ("threadScoreId") REFERENCES "ThreadScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
