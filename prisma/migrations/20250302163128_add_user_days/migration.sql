-- CreateTable
CREATE TABLE "UserDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDay_userId_idx" ON "UserDay"("userId");

-- CreateIndex
CREATE INDEX "UserDay_dayId_idx" ON "UserDay"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "UserDay_userId_dayId_key" ON "UserDay"("userId", "dayId");

-- AddForeignKey
ALTER TABLE "UserDay" ADD CONSTRAINT "UserDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDay" ADD CONSTRAINT "UserDay_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
