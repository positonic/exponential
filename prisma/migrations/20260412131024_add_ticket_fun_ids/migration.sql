/*
  Warnings:

  - A unique constraint covering the columns `[productId,number]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productId,shortId]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "funTicketIds" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ticketCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Ticket" ADD COLUMN     "number" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shortId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_productId_number_key" ON "public"."Ticket"("productId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_productId_shortId_key" ON "public"."Ticket"("productId", "shortId");
