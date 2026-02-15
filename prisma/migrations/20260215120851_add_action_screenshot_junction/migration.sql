-- CreateTable
CREATE TABLE "public"."ActionScreenshot" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "screenshotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionScreenshot_actionId_idx" ON "public"."ActionScreenshot"("actionId");

-- CreateIndex
CREATE INDEX "ActionScreenshot_screenshotId_idx" ON "public"."ActionScreenshot"("screenshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionScreenshot_actionId_screenshotId_key" ON "public"."ActionScreenshot"("actionId", "screenshotId");

-- AddForeignKey
ALTER TABLE "public"."ActionScreenshot" ADD CONSTRAINT "ActionScreenshot_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActionScreenshot" ADD CONSTRAINT "ActionScreenshot_screenshotId_fkey" FOREIGN KEY ("screenshotId") REFERENCES "public"."Screenshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
