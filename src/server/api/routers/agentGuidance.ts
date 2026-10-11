/**
 * `agentGuidance`: the method and scoped context, served the same way to
 * every agent surface (D-0010). The SDK, MCP tools, CLI commands and in-app
 * agent tools are thin wrappers over these procedures.
 *
 * Both are `protectedProcedure`, deliberately not human-only: agent keys,
 * `agent-context` JWTs and gateway JWTs all have to reach them.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { DOCS_DIR } from "~/lib/docs/content";
import { isMethodPublished } from "~/lib/docs/method";
import {
  canPreviewDraftMethod,
  getContext,
  getMethod,
  parseMethodPreviewSlugs,
} from "~/server/services/agentGuidance";

export const NO_PUBLISHED_METHOD_MESSAGE = "No published method yet";

export const agentGuidanceRouter = createTRPCRouter({
  /**
   * The current method version. Published content goes to any authenticated
   * principal; a draft only to members of a preview workspace
   * (`METHOD_PREVIEW_WORKSPACE_SLUGS`, default `exponential`).
   */
  method: protectedProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const includeDraft =
        !isMethodPublished(DOCS_DIR) &&
        (await canPreviewDraftMethod(ctx.db, {
          userId: ctx.session.user.id,
          workspaceId: input?.workspaceId,
          previewSlugs: parseMethodPreviewSlugs(env.METHOD_PREVIEW_WORKSPACE_SLUGS),
        }));
      const method = getMethod({ includeDraft });
      if (!method) throw new TRPCError({ code: "NOT_FOUND", message: NO_PUBLISHED_METHOD_MESSAGE });
      return method;
    }),

  /**
   * The selected workspace's (and optional project's) AI instructions, marked
   * as guidance and assembled exactly as chat assembles them. Requires
   * membership of the workspace; a project outside it is BAD_REQUEST.
   */
  context: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1), projectId: z.string().min(1).optional() }))
    .query(({ ctx, input }) =>
      getContext(ctx.db, { userId: ctx.session.user.id, workspaceId: input.workspaceId, projectId: input.projectId }),
    ),
});
