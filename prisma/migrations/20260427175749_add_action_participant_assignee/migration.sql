-- CreateTable
CREATE TABLE "ActionParticipantAssignee" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionParticipantAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionParticipantAssignee_actionId_idx" ON "ActionParticipantAssignee"("actionId");

-- CreateIndex
CREATE INDEX "ActionParticipantAssignee_participantId_idx" ON "ActionParticipantAssignee"("participantId");

-- CreateIndex
CREATE INDEX "ActionParticipantAssignee_workspaceId_idx" ON "ActionParticipantAssignee"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionParticipantAssignee_actionId_participantId_key" ON "ActionParticipantAssignee"("actionId", "participantId");

-- AddForeignKey
ALTER TABLE "ActionParticipantAssignee" ADD CONSTRAINT "ActionParticipantAssignee_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionParticipantAssignee" ADD CONSTRAINT "ActionParticipantAssignee_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "TranscriptionSessionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionParticipantAssignee" ADD CONSTRAINT "ActionParticipantAssignee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
