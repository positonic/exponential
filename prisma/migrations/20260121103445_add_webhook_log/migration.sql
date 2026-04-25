-- CreateTable
CREATE TABLE "public"."WebhookLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "meetingId" TEXT,
    "meetingTitle" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "userId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookLog_userId_idx" ON "public"."WebhookLog"("userId");

-- CreateIndex
CREATE INDEX "WebhookLog_workspaceId_idx" ON "public"."WebhookLog"("workspaceId");

-- CreateIndex
CREATE INDEX "WebhookLog_provider_idx" ON "public"."WebhookLog"("provider");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "public"."WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_status_idx" ON "public"."WebhookLog"("status");

-- AddForeignKey
ALTER TABLE "public"."WebhookLog" ADD CONSTRAINT "WebhookLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
