-- CreateTable
CREATE TABLE "SlackEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessageHistory" (
    "id" TEXT NOT NULL,
    "slackEventId" TEXT,
    "channelId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "systemUserId" TEXT,
    "userName" TEXT,
    "rawMessage" TEXT NOT NULL,
    "cleanMessage" TEXT NOT NULL,
    "messageType" TEXT,
    "agentUsed" TEXT,
    "responseTime" INTEGER,
    "hadError" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "category" TEXT,
    "intent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackMessageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackEvent_eventKey_key" ON "SlackEvent"("eventKey");

-- CreateIndex
CREATE INDEX "SlackEvent_eventKey_idx" ON "SlackEvent"("eventKey");

-- CreateIndex
CREATE INDEX "SlackEvent_processedAt_idx" ON "SlackEvent"("processedAt");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_slackUserId_idx" ON "SlackMessageHistory"("slackUserId");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_systemUserId_idx" ON "SlackMessageHistory"("systemUserId");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_category_idx" ON "SlackMessageHistory"("category");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_intent_idx" ON "SlackMessageHistory"("intent");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_createdAt_idx" ON "SlackMessageHistory"("createdAt");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_channelType_idx" ON "SlackMessageHistory"("channelType");

-- CreateIndex
CREATE INDEX "SlackMessageHistory_messageType_idx" ON "SlackMessageHistory"("messageType");

-- AddForeignKey
ALTER TABLE "SlackMessageHistory" ADD CONSTRAINT "SlackMessageHistory_systemUserId_fkey" FOREIGN KEY ("systemUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
