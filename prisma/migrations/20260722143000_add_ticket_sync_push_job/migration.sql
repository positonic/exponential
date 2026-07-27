-- CreateTable
CREATE TABLE "TicketSyncPushJob" (
    "id" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSyncPushJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketSyncPushJob_status_nextAttemptAt_idx" ON "TicketSyncPushJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "TicketSyncPushJob_syncId_idx" ON "TicketSyncPushJob"("syncId");

-- AddForeignKey
ALTER TABLE "TicketSyncPushJob" ADD CONSTRAINT "TicketSyncPushJob_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "TicketSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;
