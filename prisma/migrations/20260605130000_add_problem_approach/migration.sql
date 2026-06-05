-- Pipeline Triage: "Approaches" — the many-to-many link between a Problem and
-- the Projects that tackle it. An Approach IS a Project (ADR-0008), so this is
-- just a join table, not a new entity. Forward direction only in v1.

-- CreateTable
CREATE TABLE "ProblemApproach" (
    "problemId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemApproach_pkey" PRIMARY KEY ("problemId","projectId")
);

-- CreateIndex
CREATE INDEX "ProblemApproach_projectId_idx" ON "ProblemApproach"("projectId");

-- AddForeignKey
ALTER TABLE "ProblemApproach" ADD CONSTRAINT "ProblemApproach_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemApproach" ADD CONSTRAINT "ProblemApproach_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
