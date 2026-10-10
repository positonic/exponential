-- CreateTable
CREATE TABLE "DocsFeedback" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocsFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocsFeedback_path_createdAt_idx" ON "DocsFeedback"("path", "createdAt");

-- CreateIndex
CREATE INDEX "DocsFeedback_userId_idx" ON "DocsFeedback"("userId");

-- AddForeignKey
ALTER TABLE "DocsFeedback" ADD CONSTRAINT "DocsFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
