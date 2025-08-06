-- CreateTable
CREATE TABLE "SlackRegistrationToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,

    CONSTRAINT "SlackRegistrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackRegistrationToken_token_key" ON "SlackRegistrationToken"("token");

-- CreateIndex
CREATE INDEX "SlackRegistrationToken_token_idx" ON "SlackRegistrationToken"("token");

-- CreateIndex
CREATE INDEX "SlackRegistrationToken_slackUserId_idx" ON "SlackRegistrationToken"("slackUserId");

-- CreateIndex
CREATE INDEX "SlackRegistrationToken_integrationId_idx" ON "SlackRegistrationToken"("integrationId");

-- CreateIndex
CREATE INDEX "SlackRegistrationToken_expiresAt_idx" ON "SlackRegistrationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "SlackRegistrationToken" ADD CONSTRAINT "SlackRegistrationToken_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackRegistrationToken" ADD CONSTRAINT "SlackRegistrationToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackRegistrationToken" ADD CONSTRAINT "SlackRegistrationToken_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
