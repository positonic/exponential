-- CreateTable
CREATE TABLE "ActionAssignee" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ActionAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionAssignee_actionId_idx" ON "ActionAssignee"("actionId");

-- CreateIndex
CREATE INDEX "ActionAssignee_userId_idx" ON "ActionAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionAssignee_actionId_userId_key" ON "ActionAssignee"("actionId", "userId");

-- AddForeignKey
ALTER TABLE "ActionAssignee" ADD CONSTRAINT "ActionAssignee_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionAssignee" ADD CONSTRAINT "ActionAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
