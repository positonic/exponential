-- CreateTable
CREATE TABLE "UserTrade" (
    "id" SERIAL NOT NULL,
    "ordertxid" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "time" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "ordertype" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "cost" TEXT NOT NULL,
    "fee" TEXT NOT NULL,
    "vol" DOUBLE PRECISION NOT NULL,
    "margin" TEXT NOT NULL,
    "leverage" TEXT NOT NULL,
    "misc" TEXT NOT NULL,
    "closedPnL" DECIMAL(65,30),
    "tradeId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" INTEGER,

    CONSTRAINT "UserTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "ordertxid" TEXT NOT NULL,
    "time" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "totalCost" DECIMAL(65,30) NOT NULL,
    "fee" DECIMAL(65,30) NOT NULL,
    "highestPrice" DECIMAL(65,30) NOT NULL,
    "lowestPrice" DECIMAL(65,30) NOT NULL,
    "averagePrice" DECIMAL(65,30) NOT NULL,
    "exchange" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "closedPnL" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "positionId" INTEGER,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL,
    "positionType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "averageEntryPrice" DECIMAL(65,30) NOT NULL,
    "averageExitPrice" DECIMAL(65,30) NOT NULL,
    "totalCostBuy" DECIMAL(65,30) NOT NULL,
    "totalCostSell" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "profitLoss" DECIMAL(65,30) NOT NULL,
    "duration" TEXT NOT NULL,
    "time" BIGINT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTrade_tradeId_key" ON "UserTrade"("tradeId");

-- CreateIndex
CREATE INDEX "Order_time_idx" ON "Order"("time");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_pair_idx" ON "Order"("pair");

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE INDEX "Position_pair_idx" ON "Position"("pair");

-- CreateIndex
CREATE INDEX "Position_time_idx" ON "Position"("time");

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- AddForeignKey
ALTER TABLE "UserTrade" ADD CONSTRAINT "UserTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTrade" ADD CONSTRAINT "UserTrade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
