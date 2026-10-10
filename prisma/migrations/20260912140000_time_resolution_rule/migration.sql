-- Remembered Project/Ticket answers for conversation titles (Daily worklog V4).

-- CreateTable
CREATE TABLE "TimeResolutionRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titlePattern" TEXT NOT NULL,
    "projectId" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeResolutionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeResolutionRule_userId_idx" ON "TimeResolutionRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeResolutionRule_userId_titlePattern_key" ON "TimeResolutionRule"("userId", "titlePattern");

-- AddForeignKey
ALTER TABLE "TimeResolutionRule" ADD CONSTRAINT "TimeResolutionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeResolutionRule" ADD CONSTRAINT "TimeResolutionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeResolutionRule" ADD CONSTRAINT "TimeResolutionRule_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
