import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createChannelLink,
  listChannelLinks,
  unlinkChannelLink,
} from "~/server/services/channelLinkService";

/**
 * channelLink router (ADR-0023) — link / list / unlink the inbound,
 * provider-agnostic `ChannelLink`. There is no settings UI in this slice; the
 * single WhatsApp link is seeded through the `link` mutation.
 *
 * Access is enforced inside `channelLinkService` via the centralized
 * `getWorkspaceMembership` resolver, so the procedures stay thin.
 */
export const channelLinkRouter = createTRPCRouter({
  link: protectedProcedure
    .input(
      z.object({
        provider: z.string().min(1),
        externalId: z.string().min(1),
        workspaceId: z.string().min(1),
        projectId: z.string().min(1).optional(),
        displayName: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createChannelLink(ctx.db, {
        userId: ctx.session.user.id,
        provider: input.provider,
        externalId: input.externalId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        displayName: input.displayName,
      });
    }),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return listChannelLinks(ctx.db, {
        userId: ctx.session.user.id,
        workspaceId: input.workspaceId,
      });
    }),

  unlink: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return unlinkChannelLink(ctx.db, {
        userId: ctx.session.user.id,
        id: input.id,
      });
    }),
});
