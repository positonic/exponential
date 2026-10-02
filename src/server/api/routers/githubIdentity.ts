import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  isGithubIdentityConfigured,
  unlinkGithubIdentity,
} from "~/server/services/github/identityClaim";

/**
 * The signed-in user's GitHub identity claim (CONTEXT.md). Linking happens
 * through the OAuth round trip at `/api/auth/github-identity` — there is
 * deliberately no mutation that sets a login, so a claim can't be typed in.
 */
export const githubIdentityRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { githubLogin: true, githubLinkedAt: true },
    });
    return {
      login: user?.githubLogin ?? null,
      linkedAt: user?.githubLinkedAt ?? null,
      /** False until GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set. */
      isConfigured: isGithubIdentityConfigured(),
    };
  }),

  unlink: protectedProcedure.mutation(async ({ ctx }) => {
    await unlinkGithubIdentity(ctx.db, ctx.session.user.id);
    return { success: true };
  }),
});
