/*
  Warnings:

  - A unique constraint covering the columns `[webhookId]` on the table `Integration` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[firefliesId]` on the table `TranscriptionSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "lastUpdatedBy" TEXT,
ADD COLUMN     "lastUpdatedSource" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "CrmCommunication" ADD COLUMN     "agentGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewStatus" TEXT,
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisionHistory" JSONB,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "providerConfig" JSONB,
ADD COLUMN     "webhookId" TEXT;

-- AlterTable
ALTER TABLE "KnowledgeChunk" ADD COLUMN     "embeddingDim" INTEGER,
ADD COLUMN     "embeddingGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddingProvider" TEXT,
ADD COLUMN     "endTimeMs" INTEGER,
ADD COLUMN     "speakerEmail" TEXT,
ADD COLUMN     "speakerName" TEXT,
ADD COLUMN     "startTimeMs" INTEGER,
ADD COLUMN     "workspaceId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "analyticsJson" JSONB,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "firefliesId" TEXT,
ADD COLUMN     "participantCount" INTEGER,
ADD COLUMN     "sentencesJson" JSONB,
ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isServiceAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone_encrypted" BYTEA,
ADD COLUMN     "preferences" JSONB;

-- AlterTable
ALTER TABLE "WhatsAppConfig" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'META_CLOUD',
ADD COLUMN     "providerConfig" JSONB,
ALTER COLUMN "phoneNumberId" DROP NOT NULL,
ALTER COLUMN "businessAccountId" DROP NOT NULL,
ALTER COLUMN "webhookVerifyToken" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUri" TEXT,
    "s3Key" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "ingestionStatus" TEXT NOT NULL DEFAULT 'pending',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "ingestionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptionSessionParticipant" (
    "id" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "speakerLabel" TEXT,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptionSessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreMeetingBrief" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "meetingTitle" TEXT NOT NULL,
    "briefContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "deliveryChannel" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreMeetingBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "payloadSummary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingDriveUpload" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappMessageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "s3StagingKey" TEXT NOT NULL,
    "targetFolderId" TEXT,
    "state" TEXT NOT NULL,
    "driveFileId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingDriveUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_workspaceId_idx" ON "Document"("workspaceId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE INDEX "Document_sourceType_idx" ON "Document"("sourceType");

-- CreateIndex
CREATE INDEX "Document_ingestionStatus_idx" ON "Document"("ingestionStatus");

-- CreateIndex
CREATE INDEX "TranscriptionSessionParticipant_transcriptionSessionId_idx" ON "TranscriptionSessionParticipant"("transcriptionSessionId");

-- CreateIndex
CREATE INDEX "TranscriptionSessionParticipant_workspaceId_idx" ON "TranscriptionSessionParticipant"("workspaceId");

-- CreateIndex
CREATE INDEX "TranscriptionSessionParticipant_userId_idx" ON "TranscriptionSessionParticipant"("userId");

-- CreateIndex
CREATE INDEX "TranscriptionSessionParticipant_contactId_idx" ON "TranscriptionSessionParticipant"("contactId");

-- CreateIndex
CREATE INDEX "TranscriptionSessionParticipant_email_idx" ON "TranscriptionSessionParticipant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptionSessionParticipant_transcriptionSessionId_emai_key" ON "TranscriptionSessionParticipant"("transcriptionSessionId", "email");

-- CreateIndex
CREATE INDEX "PreMeetingBrief_workspaceId_idx" ON "PreMeetingBrief"("workspaceId");

-- CreateIndex
CREATE INDEX "PreMeetingBrief_userId_idx" ON "PreMeetingBrief"("userId");

-- CreateIndex
CREATE INDEX "PreMeetingBrief_meetingDate_idx" ON "PreMeetingBrief"("meetingDate");

-- CreateIndex
CREATE INDEX "PreMeetingBrief_status_idx" ON "PreMeetingBrief"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PreMeetingBrief_userId_calendarEventId_key" ON "PreMeetingBrief"("userId", "calendarEventId");

-- CreateIndex
CREATE INDEX "ReminderLog_workspaceId_idx" ON "ReminderLog"("workspaceId");

-- CreateIndex
CREATE INDEX "ReminderLog_userId_idx" ON "ReminderLog"("userId");

-- CreateIndex
CREATE INDEX "ReminderLog_reminderType_idx" ON "ReminderLog"("reminderType");

-- CreateIndex
CREATE INDEX "ReminderLog_targetEntityId_idx" ON "ReminderLog"("targetEntityId");

-- CreateIndex
CREATE INDEX "ReminderLog_sentAt_idx" ON "ReminderLog"("sentAt");

-- CreateIndex
CREATE INDEX "PendingDriveUpload_workspaceId_idx" ON "PendingDriveUpload"("workspaceId");

-- CreateIndex
CREATE INDEX "PendingDriveUpload_userId_idx" ON "PendingDriveUpload"("userId");

-- CreateIndex
CREATE INDEX "PendingDriveUpload_whatsappMessageId_idx" ON "PendingDriveUpload"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "PendingDriveUpload_state_idx" ON "PendingDriveUpload"("state");

-- CreateIndex
CREATE INDEX "PendingDriveUpload_expiresAt_idx" ON "PendingDriveUpload"("expiresAt");

-- CreateIndex
CREATE INDEX "Action_sourceType_sourceId_idx" ON "Action"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CrmCommunication_reviewStatus_idx" ON "CrmCommunication"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_webhookId_key" ON "Integration"("webhookId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_workspaceId_idx" ON "KnowledgeChunk"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptionSession_firefliesId_key" ON "TranscriptionSession"("firefliesId");

-- CreateIndex
CREATE INDEX "TranscriptionSession_firefliesId_idx" ON "TranscriptionSession"("firefliesId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptionSessionParticipant" ADD CONSTRAINT "TranscriptionSessionParticipant_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptionSessionParticipant" ADD CONSTRAINT "TranscriptionSessionParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptionSessionParticipant" ADD CONSTRAINT "TranscriptionSessionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptionSessionParticipant" ADD CONSTRAINT "TranscriptionSessionParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreMeetingBrief" ADD CONSTRAINT "PreMeetingBrief_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreMeetingBrief" ADD CONSTRAINT "PreMeetingBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDriveUpload" ADD CONSTRAINT "PendingDriveUpload_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingDriveUpload" ADD CONSTRAINT "PendingDriveUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW vector similarity index for fast workspace-scoped embedding search.
-- Uses cosine distance (matches OpenAI embedding similarity convention).
-- Prisma cannot model pgvector indexes natively — must be added manually.
--
-- Disable parallel workers for the index build: each parallel worker
-- allocates its own shared-memory segment (/dev/shm), which on small
-- Postgres instances (Railway/Docker default) overflows with
-- "could not resize shared memory segment ... No space left on device".
-- Single-threaded build is slower but uses bounded memory.
SET LOCAL max_parallel_maintenance_workers = 0;

CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
  ON "KnowledgeChunk"
  USING hnsw (embedding vector_cosine_ops);
