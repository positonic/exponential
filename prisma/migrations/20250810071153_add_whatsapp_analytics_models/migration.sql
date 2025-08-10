-- CreateTable
CREATE TABLE "WhatsAppTemplateUsage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedBy" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "messageId" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "variables" JSONB,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppTemplateUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageAnalytics" (
    "id" TEXT NOT NULL,
    "whatsappConfigId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "messagesReceived" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "messagesDelivered" INTEGER NOT NULL DEFAULT 0,
    "messagesRead" INTEGER NOT NULL DEFAULT 0,
    "messagesFailed" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" DOUBLE PRECISION,
    "maxResponseTime" DOUBLE PRECISION,
    "minResponseTime" DOUBLE PRECISION,
    "avgMessagesPerUser" DOUBLE PRECISION,
    "avgConversationLength" DOUBLE PRECISION,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessageAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppPerformanceMetrics" (
    "id" TEXT NOT NULL,
    "whatsappConfigId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiCallsCount" INTEGER NOT NULL DEFAULT 0,
    "apiSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "apiErrorCount" INTEGER NOT NULL DEFAULT 0,
    "avgApiLatency" DOUBLE PRECISION,
    "maxApiLatency" DOUBLE PRECISION,
    "webhooksReceived" INTEGER NOT NULL DEFAULT 0,
    "webhooksProcessed" INTEGER NOT NULL DEFAULT 0,
    "webhooksFailed" INTEGER NOT NULL DEFAULT 0,
    "avgWebhookLatency" DOUBLE PRECISION,
    "queueSize" INTEGER NOT NULL DEFAULT 0,
    "queueBacklog" INTEGER NOT NULL DEFAULT 0,
    "cacheHitRate" DOUBLE PRECISION,
    "circuitBreakerTrips" INTEGER NOT NULL DEFAULT 0,
    "memoryUsage" DOUBLE PRECISION,
    "cpuUsage" DOUBLE PRECISION,

    CONSTRAINT "WhatsAppPerformanceMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppRateLimitTracking" (
    "id" TEXT NOT NULL,
    "whatsappConfigId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "limitType" TEXT NOT NULL,
    "limitValue" INTEGER NOT NULL,
    "currentUsage" INTEGER NOT NULL DEFAULT 0,
    "remainingQuota" INTEGER NOT NULL,
    "resetsAt" TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "warningThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "criticalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppRateLimitTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookDelivery" (
    "id" TEXT NOT NULL,
    "whatsappConfigId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "processingTime" DOUBLE PRECISION,
    "queueTime" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "errorStack" TEXT,

    CONSTRAINT "WhatsAppWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppTemplateUsage_templateId_idx" ON "WhatsAppTemplateUsage"("templateId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplateUsage_usedAt_idx" ON "WhatsAppTemplateUsage"("usedAt");

-- CreateIndex
CREATE INDEX "WhatsAppTemplateUsage_status_idx" ON "WhatsAppTemplateUsage"("status");

-- CreateIndex
CREATE INDEX "WhatsAppMessageAnalytics_whatsappConfigId_date_idx" ON "WhatsAppMessageAnalytics"("whatsappConfigId", "date");

-- CreateIndex
CREATE INDEX "WhatsAppMessageAnalytics_date_idx" ON "WhatsAppMessageAnalytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageAnalytics_whatsappConfigId_date_hour_key" ON "WhatsAppMessageAnalytics"("whatsappConfigId", "date", "hour");

-- CreateIndex
CREATE INDEX "WhatsAppPerformanceMetrics_whatsappConfigId_timestamp_idx" ON "WhatsAppPerformanceMetrics"("whatsappConfigId", "timestamp");

-- CreateIndex
CREATE INDEX "WhatsAppPerformanceMetrics_timestamp_idx" ON "WhatsAppPerformanceMetrics"("timestamp");

-- CreateIndex
CREATE INDEX "WhatsAppRateLimitTracking_whatsappConfigId_idx" ON "WhatsAppRateLimitTracking"("whatsappConfigId");

-- CreateIndex
CREATE INDEX "WhatsAppRateLimitTracking_resetsAt_idx" ON "WhatsAppRateLimitTracking"("resetsAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppRateLimitTracking_whatsappConfigId_endpoint_limitTy_key" ON "WhatsAppRateLimitTracking"("whatsappConfigId", "endpoint", "limitType");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookDelivery_webhookId_key" ON "WhatsAppWebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookDelivery_whatsappConfigId_status_idx" ON "WhatsAppWebhookDelivery"("whatsappConfigId", "status");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookDelivery_receivedAt_idx" ON "WhatsAppWebhookDelivery"("receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookDelivery_webhookId_idx" ON "WhatsAppWebhookDelivery"("webhookId");

-- AddForeignKey
ALTER TABLE "WhatsAppTemplateUsage" ADD CONSTRAINT "WhatsAppTemplateUsage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageAnalytics" ADD CONSTRAINT "WhatsAppMessageAnalytics_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "WhatsAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPerformanceMetrics" ADD CONSTRAINT "WhatsAppPerformanceMetrics_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "WhatsAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppRateLimitTracking" ADD CONSTRAINT "WhatsAppRateLimitTracking_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "WhatsAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookDelivery" ADD CONSTRAINT "WhatsAppWebhookDelivery_whatsappConfigId_fkey" FOREIGN KEY ("whatsappConfigId") REFERENCES "WhatsAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
