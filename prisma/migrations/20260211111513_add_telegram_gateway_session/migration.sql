-- CreateEnum
CREATE TYPE "public"."TelegramGatewayStatus" AS ENUM ('DISCONNECTED', 'CONNECTED');

-- CreateTable
CREATE TABLE "public"."TelegramGatewaySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "agentId" TEXT NOT NULL DEFAULT 'assistant',
    "status" "public"."TelegramGatewayStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramGatewaySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramGatewaySession_userId_key" ON "public"."TelegramGatewaySession"("userId");

-- AddForeignKey
ALTER TABLE "public"."TelegramGatewaySession" ADD CONSTRAINT "TelegramGatewaySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
