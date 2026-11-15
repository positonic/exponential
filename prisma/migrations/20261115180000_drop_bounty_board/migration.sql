-- Retired bounty board, step 3 of 3 (expand/contract).
--
-- Merge only after step 2 (20261115170000_retire_bounty_board_indexes) is
-- deployed and live: its client marks these columns @ignore and no longer
-- selects them, so dropping them cannot break the deployment still serving
-- traffic while this migration runs ahead of Vercel.
--
-- Destructive: bounty settings, claims, per-action bounty data, wallets and
-- contributor profile fields are deleted. Nothing in the app or ../mastra
-- reads them.

-- DropTable (their FKs and indexes go with them)
DROP TABLE "public"."BountyClaim";
DROP TABLE "public"."Wallet";

-- AlterTable
ALTER TABLE "public"."Action" DROP COLUMN "bountyAmount",
DROP COLUMN "bountyDeadline",
DROP COLUMN "bountyDifficulty",
DROP COLUMN "bountyExternalUrl",
DROP COLUMN "bountyMaxClaimants",
DROP COLUMN "bountySkills",
DROP COLUMN "bountyStatus",
DROP COLUMN "bountyToken",
DROP COLUMN "isBounty";

ALTER TABLE "public"."Project" DROP COLUMN "enableBounties";
ALTER TABLE "public"."Workspace" DROP COLUMN "enableBounties";
ALTER TABLE "public"."User" DROP COLUMN "bio",
DROP COLUMN "contributorSkills",
DROP COLUMN "displayName",
DROP COLUMN "isContributor";

-- DropEnum
DROP TYPE "public"."BountyStatus";
DROP TYPE "public"."ClaimStatus";
