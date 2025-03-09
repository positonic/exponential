/*
  Warnings:

  - Added the required column `direction` to the `Setup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Setup" ADD COLUMN     "direction" TEXT NOT NULL;
