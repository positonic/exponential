-- CreateTable
CREATE TABLE "WeeklyWorkDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "angles" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyWorkDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyWorkDigest_userId_generatedAt_idx" ON "WeeklyWorkDigest"("userId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyWorkDigest_userId_isoYear_isoWeek_key" ON "WeeklyWorkDigest"("userId", "isoYear", "isoWeek");

-- AddForeignKey
ALTER TABLE "WeeklyWorkDigest" ADD CONSTRAINT "WeeklyWorkDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
