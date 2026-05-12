-- DropForeignKey
ALTER TABLE "WorkspaceActivityEvent" DROP CONSTRAINT "WorkspaceActivityEvent_userId_fkey";

-- AlterTable
ALTER TABLE "WorkspaceActivityEvent" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "WorkspaceActivityEvent" ADD CONSTRAINT "WorkspaceActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
