-- ADR-0067: an Assistant is backed by its own External agent principal.

-- CreateEnum
CREATE TYPE "AgentExecutor" AS ENUM ('MASTRA', 'LOCAL_CLI');

-- AlterTable
ALTER TABLE "ExternalAgent" ADD COLUMN     "executor" "AgentExecutor" NOT NULL DEFAULT 'MASTRA';

-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "externalAgentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Assistant_externalAgentId_key" ON "Assistant"("externalAgentId");

-- AddForeignKey
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_externalAgentId_fkey" FOREIGN KEY ("externalAgentId") REFERENCES "ExternalAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing Assistant gets its principal — a shadow user, an
-- External agent owned by the Assistant's creator, and (only where the creator
-- still holds a non-viewer membership in that workspace — the delegation
-- invariant wins) a `member` row in the Assistant's workspace. Idempotent:
-- Assistants that already carry an externalAgentId are skipped.
DO $$
DECLARE
  a RECORD;
  shadow_id TEXT;
  agent_id TEXT;
  skipped INT := 0;
BEGIN
  FOR a IN
    SELECT "id", "name", "workspaceId", "createdById"
    FROM "Assistant"
    WHERE "externalAgentId" IS NULL
  LOOP
    shadow_id := replace(gen_random_uuid()::text, '-', '');
    agent_id := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO "User" ("id", "name", "isAgent")
    VALUES (shadow_id, a."name", true);

    INSERT INTO "ExternalAgent" ("id", "name", "ownerId", "shadowUserId", "createdAt", "updatedAt")
    VALUES (agent_id, a."name", a."createdById", shadow_id, now(), now());

    IF EXISTS (
      SELECT 1 FROM "WorkspaceUser" wu
      WHERE wu."userId" = a."createdById"
        AND wu."workspaceId" = a."workspaceId"
        AND wu."role" <> 'viewer'
    ) THEN
      INSERT INTO "WorkspaceUser" ("id", "userId", "workspaceId", "role")
      VALUES (replace(gen_random_uuid()::text, '-', ''), shadow_id, a."workspaceId", 'member');
    ELSE
      skipped := skipped + 1;
      RAISE NOTICE 'Assistant % (%): owner % is not a non-viewer member of workspace %, membership skipped',
        a."id", a."name", a."createdById", a."workspaceId";
    END IF;

    UPDATE "Assistant" SET "externalAgentId" = agent_id WHERE "id" = a."id";
  END LOOP;

  RAISE NOTICE 'Assistant backfill done; % membership(s) skipped under the delegation invariant', skipped;
END $$;

-- Every Assistant is a principal from here on.
ALTER TABLE "Assistant" ALTER COLUMN "externalAgentId" SET NOT NULL;
