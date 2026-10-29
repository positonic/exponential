-- The written change log for a cycle: an LLM draft of what shipped, editable by
-- people, shown on /w/[workspaceSlug]/change-log in place of the raw view.

-- CreateTable
CREATE TABLE "CycleChangelogDraft" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "version" TEXT,
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'generated',
    "model" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleChangelogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CycleChangelogDraft_cycleId_key" ON "CycleChangelogDraft"("cycleId");

-- AddForeignKey
ALTER TABLE "CycleChangelogDraft" ADD CONSTRAINT "CycleChangelogDraft_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
