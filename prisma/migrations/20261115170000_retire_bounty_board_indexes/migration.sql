-- Retired bounty board, step 2 of 3 (expand/contract).
--
-- schema.prisma now marks every bounty column and table @ignore, so the
-- client deployed with this change stops selecting them. The columns,
-- tables and enums stay until the next migration drops them, which must
-- merge only after this deployment is live: migrations run on push to main
-- before Vercel deploys, and the previous client still selects them.
--
-- Only the two bounty indexes go now. No client reads an index, so dropping
-- them is safe whichever deployment is serving.

-- DropIndex
DROP INDEX "public"."Action_isBounty_idx";
DROP INDEX "public"."Action_bountyStatus_idx";
