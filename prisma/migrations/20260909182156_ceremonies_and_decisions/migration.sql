-- CreateEnum
CREATE TYPE "CeremonyKind" AS ENUM ('STANDUP', 'PLANNING', 'REVIEW', 'RETROSPECTIVE', 'PRIORITISATION', 'ALL_HANDS', 'ONE_ON_ONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CeremonyOccurrenceStatus" AS ENUM ('PLANNED', 'AGENDA_CIRCULATED', 'IN_PROGRESS', 'CAPTURED', 'FOLLOWED_THROUGH', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('OPEN', 'PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "DecisionReviewState" AS ENUM ('DRAFT', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DecisionSource" AS ENUM ('MEETING', 'MANUAL', 'AGENT');

-- AlterTable
ALTER TABLE "TranscriptionSession" ADD COLUMN     "occurrenceId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "decisionCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Ceremony" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "teamId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kind" "CeremonyKind" NOT NULL DEFAULT 'CUSTOM',
    "purpose" TEXT,
    "notFor" TEXT,
    "inputs" TEXT,
    "outputs" TEXT,
    "cadenceRule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "leadTimeHours" INTEGER NOT NULL DEFAULT 24,
    "ownerId" TEXT NOT NULL,
    "agendaTemplate" JSONB NOT NULL DEFAULT '[]',
    "matrixRoomId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ceremony_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeremonyParticipant" (
    "id" TEXT NOT NULL,
    "ceremonyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CeremonyParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeremonyOccurrence" (
    "id" TEXT NOT NULL,
    "ceremonyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "CeremonyOccurrenceStatus" NOT NULL DEFAULT 'PLANNED',
    "skipReason" TEXT,
    "definitionSnapshot" JSONB NOT NULL,
    "agenda" JSONB,
    "agendaGeneratedAt" TIMESTAMP(3),
    "agendaCirculatedAt" TIMESTAMP(3),
    "scheduledMeetingId" TEXT,
    "previousOccurrenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeremonyOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "body" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "reviewState" "DecisionReviewState" NOT NULL DEFAULT 'CONFIRMED',
    "source" "DecisionSource" NOT NULL DEFAULT 'MANUAL',
    "decidedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "transcriptionSessionId" TEXT,
    "occurrenceId" TEXT,
    "productId" TEXT,
    "projectId" TEXT,
    "goalId" INTEGER,
    "keyResultId" TEXT,
    "supersededById" TEXT,
    "adrDocumentId" TEXT,
    "pendingAdrPrUrl" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionDecider" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "DecisionDecider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionLink" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ticketId" TEXT,
    "featureId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ceremony_workspaceId_isActive_idx" ON "Ceremony"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "Ceremony_productId_idx" ON "Ceremony"("productId");

-- CreateIndex
CREATE INDEX "Ceremony_teamId_idx" ON "Ceremony"("teamId");

-- CreateIndex
CREATE INDEX "Ceremony_projectId_idx" ON "Ceremony"("projectId");

-- CreateIndex
CREATE INDEX "Ceremony_ownerId_idx" ON "Ceremony"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ceremony_workspaceId_slug_key" ON "Ceremony"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "CeremonyParticipant_userId_idx" ON "CeremonyParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyParticipant_ceremonyId_userId_key" ON "CeremonyParticipant"("ceremonyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyOccurrence_scheduledMeetingId_key" ON "CeremonyOccurrence"("scheduledMeetingId");

-- CreateIndex
CREATE INDEX "CeremonyOccurrence_workspaceId_scheduledStart_idx" ON "CeremonyOccurrence"("workspaceId", "scheduledStart");

-- CreateIndex
CREATE INDEX "CeremonyOccurrence_status_idx" ON "CeremonyOccurrence"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CeremonyOccurrence_ceremonyId_scheduledStart_key" ON "CeremonyOccurrence"("ceremonyId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_status_idx" ON "Decision"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Decision_transcriptionSessionId_idx" ON "Decision"("transcriptionSessionId");

-- CreateIndex
CREATE INDEX "Decision_occurrenceId_idx" ON "Decision"("occurrenceId");

-- CreateIndex
CREATE INDEX "Decision_projectId_idx" ON "Decision"("projectId");

-- CreateIndex
CREATE INDEX "Decision_productId_idx" ON "Decision"("productId");

-- CreateIndex
CREATE INDEX "Decision_reviewState_idx" ON "Decision"("reviewState");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_workspaceId_number_key" ON "Decision"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "DecisionDecider_userId_idx" ON "DecisionDecider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionDecider_decisionId_email_key" ON "DecisionDecider"("decisionId", "email");

-- CreateIndex
CREATE INDEX "DecisionLink_ticketId_idx" ON "DecisionLink"("ticketId");

-- CreateIndex
CREATE INDEX "DecisionLink_featureId_idx" ON "DecisionLink"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionLink_decisionId_ticketId_key" ON "DecisionLink"("decisionId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionLink_decisionId_featureId_key" ON "DecisionLink"("decisionId", "featureId");

-- CreateIndex
CREATE INDEX "TranscriptionSession_occurrenceId_idx" ON "TranscriptionSession"("occurrenceId");

-- AddForeignKey
ALTER TABLE "TranscriptionSession" ADD CONSTRAINT "TranscriptionSession_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CeremonyOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ceremony" ADD CONSTRAINT "Ceremony_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyParticipant" ADD CONSTRAINT "CeremonyParticipant_ceremonyId_fkey" FOREIGN KEY ("ceremonyId") REFERENCES "Ceremony"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyParticipant" ADD CONSTRAINT "CeremonyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyOccurrence" ADD CONSTRAINT "CeremonyOccurrence_ceremonyId_fkey" FOREIGN KEY ("ceremonyId") REFERENCES "Ceremony"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyOccurrence" ADD CONSTRAINT "CeremonyOccurrence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyOccurrence" ADD CONSTRAINT "CeremonyOccurrence_scheduledMeetingId_fkey" FOREIGN KEY ("scheduledMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeremonyOccurrence" ADD CONSTRAINT "CeremonyOccurrence_previousOccurrenceId_fkey" FOREIGN KEY ("previousOccurrenceId") REFERENCES "CeremonyOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "CeremonyOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "KeyResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_adrDocumentId_fkey" FOREIGN KEY ("adrDocumentId") REFERENCES "AdrDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionDecider" ADD CONSTRAINT "DecisionDecider_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionDecider" ADD CONSTRAINT "DecisionDecider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionLink" ADD CONSTRAINT "DecisionLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
