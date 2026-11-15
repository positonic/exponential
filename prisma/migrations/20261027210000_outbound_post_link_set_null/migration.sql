-- An OutboundPost is history once sent: removing the binding it was enqueued for must
-- not delete it (the provider/externalId columns exist precisely so it survives).
-- The link becomes optional and is nulled on unbind; a pending row without a link is
-- cancelled by the deliverer rather than sent.

-- DropForeignKey
ALTER TABLE "OutboundPost" DROP CONSTRAINT "OutboundPost_channelLinkId_fkey";

-- AlterTable
ALTER TABLE "OutboundPost" ALTER COLUMN "channelLinkId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OutboundPost" ADD CONSTRAINT "OutboundPost_channelLinkId_fkey" FOREIGN KEY ("channelLinkId") REFERENCES "ChannelLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
