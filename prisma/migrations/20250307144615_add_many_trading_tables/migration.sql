-- CreateTable
CREATE TABLE "Setup" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entryPrice" DECIMAL(65,30),
    "takeProfitPrice" DECIMAL(65,30),
    "stopPrice" DECIMAL(65,30),
    "timeframe" TEXT,
    "confidence" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoId" TEXT NOT NULL,
    "pairId" INTEGER NOT NULL,

    CONSTRAINT "Setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pair" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPair" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "pairId" INTEGER NOT NULL,
    "exchangeId" INTEGER NOT NULL,
    "lastTradesSyncTime" TIMESTAMP(3),

    CONSTRAINT "UserPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeUser" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeId" INTEGER NOT NULL,
    "lastTradesSyncTime" TIMESTAMP(3),

    CONSTRAINT "ExchangeUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Setup_videoId_idx" ON "Setup"("videoId");

-- CreateIndex
CREATE INDEX "Setup_pairId_idx" ON "Setup"("pairId");

-- CreateIndex
CREATE UNIQUE INDEX "Pair_symbol_key" ON "Pair"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "UserPair_userId_pairId_exchangeId_key" ON "UserPair"("userId", "pairId", "exchangeId");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_name_key" ON "Exchange"("name");

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPair" ADD CONSTRAINT "UserPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPair" ADD CONSTRAINT "UserPair_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPair" ADD CONSTRAINT "UserPair_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeUser" ADD CONSTRAINT "ExchangeUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeUser" ADD CONSTRAINT "ExchangeUser_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
