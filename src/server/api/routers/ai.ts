import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { resolveAiCapabilities } from "~/server/services/ai/capabilities";

export const aiRouter = createTRPCRouter({
  /**
   * Which AI this install has, for the UI to hide or explain AI surfaces
   * (`useAiCapabilities`). Reads the same resolver as every server-side gate
   * (`requireAi`) and the self-host preflight, so a surface shows exactly when
   * its procedure would run.
   *
   * Signed-in callers only: every page that hides AI surfaces sits behind
   * sign-in, and the (sidemenu) layout seeds the answer server-side anyway, so
   * anonymous visitors have no reason to learn which AI the server has
   * configured. Booleans only, never a key or URL. Keep the shape additive.
   */
  getCapabilities: protectedProcedure.query(() => resolveAiCapabilities(process.env)),
});
