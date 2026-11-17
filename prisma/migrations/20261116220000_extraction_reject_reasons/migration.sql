-- Why a reviewer rejected a draft decision or open question.
ALTER TABLE "Decision" ADD COLUMN "rejectionReason" TEXT;

-- Draft actions a reviewer discarded: kept so they are not drafted again and
-- so the extraction eval can learn from them. The draft Action row is deleted.
CREATE TABLE "DiscardedActionDraft" (
    "id" TEXT NOT NULL,
    "transcriptionSessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "discardedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscardedActionDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscardedActionDraft_transcriptionSessionId_idx" ON "DiscardedActionDraft"("transcriptionSessionId");

ALTER TABLE "DiscardedActionDraft" ADD CONSTRAINT "DiscardedActionDraft_transcriptionSessionId_fkey" FOREIGN KEY ("transcriptionSessionId") REFERENCES "TranscriptionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
