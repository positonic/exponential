/*
  Warnings:

  - You are about to drop the `PairCoin` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PairCoin" DROP CONSTRAINT "PairCoin_coinId_fkey";

-- DropForeignKey
ALTER TABLE "PairCoin" DROP CONSTRAINT "PairCoin_pairId_fkey";

-- AlterTable
ALTER TABLE "Pair" ADD COLUMN     "baseCoinId" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quoteCoinId" INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE "PairCoin";

-- CreateIndex
CREATE INDEX "Pair_baseCoinId_idx" ON "Pair"("baseCoinId");

-- CreateIndex
CREATE INDEX "Pair_quoteCoinId_idx" ON "Pair"("quoteCoinId");

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_baseCoinId_fkey" FOREIGN KEY ("baseCoinId") REFERENCES "Coin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_quoteCoinId_fkey" FOREIGN KEY ("quoteCoinId") REFERENCES "Coin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
