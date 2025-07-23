/*
  Warnings:

  - You are about to drop the `Alert` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Coin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Exchange` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExchangeUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Pair` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Position` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserDay` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserPair` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserTrade` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserVideo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VideoChunk` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Workflow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkflowStep` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ProjectToWorkflow` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `progress` on table `Project` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_pairId_fkey";

-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_setupId_fkey";

-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExchangeUser" DROP CONSTRAINT "ExchangeUser_exchangeId_fkey";

-- DropForeignKey
ALTER TABLE "ExchangeUser" DROP CONSTRAINT "ExchangeUser_userId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_positionId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_userId_fkey";

-- DropForeignKey
ALTER TABLE "Pair" DROP CONSTRAINT "Pair_baseCoinId_fkey";

-- DropForeignKey
ALTER TABLE "Pair" DROP CONSTRAINT "Pair_quoteCoinId_fkey";

-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_userId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_coinId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_pairId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_transcriptionSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_userId_fkey";

-- DropForeignKey
ALTER TABLE "Setup" DROP CONSTRAINT "Setup_videoId_fkey";

-- DropForeignKey
ALTER TABLE "UserDay" DROP CONSTRAINT "UserDay_dayId_fkey";

-- DropForeignKey
ALTER TABLE "UserDay" DROP CONSTRAINT "UserDay_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserPair" DROP CONSTRAINT "UserPair_exchangeId_fkey";

-- DropForeignKey
ALTER TABLE "UserPair" DROP CONSTRAINT "UserPair_pairId_fkey";

-- DropForeignKey
ALTER TABLE "UserPair" DROP CONSTRAINT "UserPair_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserTrade" DROP CONSTRAINT "UserTrade_orderId_fkey";

-- DropForeignKey
ALTER TABLE "UserTrade" DROP CONSTRAINT "UserTrade_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserVideo" DROP CONSTRAINT "UserVideo_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserVideo" DROP CONSTRAINT "UserVideo_videoId_fkey";

-- DropForeignKey
ALTER TABLE "VideoChunk" DROP CONSTRAINT "VideoChunk_video_id_fkey";

-- DropForeignKey
ALTER TABLE "Workflow" DROP CONSTRAINT "Workflow_createdById_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowStep" DROP CONSTRAINT "WorkflowStep_actionId_fkey";

-- DropForeignKey
ALTER TABLE "WorkflowStep" DROP CONSTRAINT "WorkflowStep_workflowId_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectToWorkflow" DROP CONSTRAINT "_ProjectToWorkflow_A_fkey";

-- DropForeignKey
ALTER TABLE "_ProjectToWorkflow" DROP CONSTRAINT "_ProjectToWorkflow_B_fkey";

-- AlterTable
ALTER TABLE "Outcome" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "progress" SET NOT NULL;

-- DropTable
DROP TABLE "Alert";

-- DropTable
DROP TABLE "Coin";

-- DropTable
DROP TABLE "Exchange";

-- DropTable
DROP TABLE "ExchangeUser";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "Pair";

-- DropTable
DROP TABLE "Position";

-- DropTable
DROP TABLE "Setup";

-- DropTable
DROP TABLE "UserDay";

-- DropTable
DROP TABLE "UserPair";

-- DropTable
DROP TABLE "UserTrade";

-- DropTable
DROP TABLE "UserVideo";

-- DropTable
DROP TABLE "VideoChunk";

-- DropTable
DROP TABLE "Workflow";

-- DropTable
DROP TABLE "WorkflowStep";

-- DropTable
DROP TABLE "_ProjectToWorkflow";

-- DropEnum
DROP TYPE "AlertStatus";

-- DropEnum
DROP TYPE "AlertType";

-- DropEnum
DROP TYPE "Direction";
