-- AlterTable
ALTER TABLE "Setup" ADD COLUMN     "coinId" INTEGER;

-- CreateTable
CREATE TABLE "Coin" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "imageUrl" TEXT,
    "coinId" TEXT,

    CONSTRAINT "Coin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairCoin" (
    "pairId" INTEGER NOT NULL,
    "coinId" INTEGER NOT NULL,

    CONSTRAINT "PairCoin_pkey" PRIMARY KEY ("pairId","coinId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coin_coinId_key" ON "Coin"("coinId");

-- CreateIndex
CREATE INDEX "PairCoin_coinId_idx" ON "PairCoin"("coinId");

-- CreateIndex
CREATE INDEX "PairCoin_pairId_idx" ON "PairCoin"("pairId");

-- AddForeignKey
ALTER TABLE "Setup" ADD CONSTRAINT "Setup_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairCoin" ADD CONSTRAINT "PairCoin_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairCoin" ADD CONSTRAINT "PairCoin_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
