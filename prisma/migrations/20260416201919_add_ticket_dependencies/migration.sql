/*
  Warnings:

  - You are about to drop the column `blockedByIds` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `blockingIds` on the `Ticket` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Ticket" DROP COLUMN "blockedByIds",
DROP COLUMN "blockingIds";

-- CreateTable
CREATE TABLE "public"."TicketDependency" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "TicketDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketDependency_ticketId_idx" ON "public"."TicketDependency"("ticketId");

-- CreateIndex
CREATE INDEX "TicketDependency_dependsOnId_idx" ON "public"."TicketDependency"("dependsOnId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketDependency_ticketId_dependsOnId_key" ON "public"."TicketDependency"("ticketId", "dependsOnId");

-- AddForeignKey
ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketDependency" ADD CONSTRAINT "TicketDependency_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
