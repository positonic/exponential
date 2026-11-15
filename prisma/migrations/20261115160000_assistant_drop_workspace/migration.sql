-- ADR-0072 contract step: an Assistant is one per person and belongs to no
-- workspace. Where it works is its principal's WorkspaceUser memberships, which
-- this leaves untouched. `isDefault` meant "default per workspace"; with one
-- Assistant per person (the partial unique index "Assistant_active_per_user_key")
-- it carries nothing. Dropping the foreign key also ends the cascade that
-- deleted a workspace's Assistants with the workspace.

-- DropForeignKey
ALTER TABLE "Assistant" DROP CONSTRAINT "Assistant_workspaceId_fkey";

-- DropIndex
DROP INDEX "Assistant_workspaceId_idx";

-- AlterTable
ALTER TABLE "Assistant" DROP COLUMN "isDefault",
DROP COLUMN "workspaceId";
